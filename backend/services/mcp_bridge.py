"""
Shared helpers for the two Claude Code MCP companion servers
(routers/mcp_candidate.py, routers/mcp_recruiter.py).

Deliberately thin: both routers import `_by_token`/`_own_submission`/`candidate_view`
directly from routers/assignments.py rather than duplicating that logic — this module
only holds the pieces that are genuinely new (connection tracking, recruiter API keys,
the merged report+resume context, and a light per-credential rate limit).
"""
from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

import models
from mcp.server.transport_security import TransportSecuritySettings

from config import settings

# ── transport security (DNS-rebinding protection) ─────────────────────────────

# mcp's TransportSecuritySettings only trusts 127.0.0.1/localhost/::1 (with a port) by
# default — a real deployed request would get 421 Misdirected Request otherwise. Build
# one settings object shared by both FastMCP servers, combining the always-allowed local
# dev patterns with whatever real host(s) are configured via MCP_ALLOWED_HOSTS.
def build_transport_security() -> TransportSecuritySettings:
    hosts = ["127.0.0.1:*", "127.0.0.1", "localhost:*", "localhost", "[::1]:*", "[::1]"]
    for host in settings.MCP_ALLOWED_HOSTS.split(","):
        host = host.strip()
        if not host:
            continue
        hosts.append(host)
        hosts.append(f"{host}:*")
    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=hosts,
        allowed_origins=[],  # Claude Code (a CLI, not a browser) sends no Origin header;
                              # absent Origin always passes validation regardless of this list.
    )


# ── candidate-side connection tracking ─────────────────────────────────────────

def mark_mcp_connected(db: Session, submission: models.AssignmentSubmission) -> None:
    """Called on every successful candidate MCP tool call. Idempotent — only sets
    mcp_connected_at once, always bumps mcp_last_seen_at."""
    now = datetime.now(timezone.utc)
    if submission.mcp_connected_at is None:
        submission.mcp_connected_at = now
    submission.mcp_last_seen_at = now
    db.commit()


# ── recruiter API keys ─────────────────────────────────────────────────────────

def issue_recruiter_key(db: Session, recruiter: models.User) -> models.RecruiterMcpApiKey:
    key = models.RecruiterMcpApiKey(
        recruiter_id=recruiter.id,
        key=secrets.token_urlsafe(32),
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    return key


def revoke_recruiter_key(db: Session, key_id: int, recruiter: models.User) -> models.RecruiterMcpApiKey | None:
    key = db.get(models.RecruiterMcpApiKey, key_id)
    if not key or key.recruiter_id != recruiter.id:
        return None
    key.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return key


def mark_recruiter_key_used(db: Session, key: models.RecruiterMcpApiKey) -> None:
    key.last_used_at = datetime.now(timezone.utc)
    db.commit()


# ── merged candidate context (report + resume) for the recruiter copilot ──────

def _loads(value, default):
    try:
        return json.loads(value) if value else default
    except (TypeError, ValueError):
        return default


def get_merged_candidate_context(db: Session, submission: models.AssignmentSubmission) -> dict:
    """Joins AssignmentSubmission -> FluencyReport (existing FK) and
    AssignmentSubmission.application_id -> Application (existing nullable FK) into one
    dict. Shared by get_candidate_report / ask_about_candidate / generate_interview_questions
    so none of them re-read the raw transcript — bounded cost, per the PRP's central
    constraint that transcript bytes never flow back out over MCP either."""
    report = submission.report
    application = submission.application  # may be None — MCP-invited candidates aren't
                                            # guaranteed to have a ranked Application row

    context: dict = {
        "submission_id": submission.id,
        "candidate_name": submission.candidate_name,
        "candidate_email": submission.candidate_email,
        "status": submission.status,
        "assignment_title": submission.assignment.title,
        "job_title": submission.assignment.job.title,
    }

    if report:
        context["report"] = {
            "overall_score": report.overall_score,
            "summary": report.summary,
            "dimensions": _loads(report.dimensions, []),
            "highlights": _loads(report.highlights, {}),
            "metrics": _loads(report.metrics, {}),
            "integrity_flags": _loads(report.integrity_flags, []),
            "integrity_confidence": report.integrity_confidence,
        }
    else:
        context["report"] = None

    if application:
        context["resume"] = {
            "resume_text": application.resume_text,
            "match_score": application.match_score,
        }
    else:
        context["resume"] = None

    return context


# ── light rate limiting (hygiene, not launch-blocking — see PRP) ──────────────

# In-process only: this backend runs as a single Uvicorn process (no --workers), so a
# module-level dict survives for the process lifetime.
#
# Two SEPARATE logs, deliberately:
#   _credential_call_log  — keyed by a RESOLVED identity (e.g. "submission:<id>" /
#                            "key:<id>"), only ever touched AFTER the credential has
#                            been validated against the DB. Bounded by the real number
#                            of rows in the database — an attacker can't grow this.
#   _auth_failure_log     — keyed by client IP, touched on missing/malformed/unknown
#                            credentials (i.e. BEFORE validation). This is what actually
#                            stops an attacker spamming unique garbage bearer tokens:
#                            check_rate_limit() alone can't see those, since it's never
#                            called with unvalidated input.
# Both also get a hard cap on distinct keys (_RATE_MAX_KEYS), with oldest-inserted
# entries evicted once exceeded — belt-and-suspenders so neither log can grow
# unbounded even in a scenario neither of the above assumptions anticipated.
_RATE_WINDOW = timedelta(minutes=1)
_RATE_MAX_KEYS = 5000

_credential_call_log: dict[str, list[datetime]] = {}
_auth_failure_log: dict[str, list[datetime]] = {}


def _rate_limited(log: dict[str, list[datetime]], key: str, max_calls: int) -> bool:
    now = datetime.now(timezone.utc)
    calls = [t for t in log.get(key, []) if now - t < _RATE_WINDOW]
    calls.append(now)
    log[key] = calls
    if len(log) > _RATE_MAX_KEYS:
        for stale_key in list(log)[: len(log) - _RATE_MAX_KEYS]:
            del log[stale_key]
    return len(calls) <= max_calls


def check_rate_limit(credential_id: str) -> bool:
    """Call ONLY after the credential has been validated against the DB — pass a
    resolved identity string (e.g. f"submission:{submission.id}" or f"key:{key.id}"),
    never a raw/unvalidated secret."""
    return _rate_limited(_credential_call_log, credential_id, max_calls=30)


def check_auth_failure_rate_limit(client_ip: str) -> bool:
    """Coarse per-IP throttle for the PRE-validation path (missing/malformed/unknown
    Authorization header) — call this in the failure branches of _authenticate, not
    on every request, so legitimate traffic never touches this counter at all."""
    return _rate_limited(_auth_failure_log, client_ip, max_calls=20)
