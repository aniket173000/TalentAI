"""
Claude Code MCP interview-prep copilot for recruiters.

Auth: a long-lived RecruiterMcpApiKey (generated via routers/recruiter_mcp_keys.py,
JWT-gated) — deliberately a SEPARATE FastMCP instance and auth model from
routers/mcp_candidate.py. A recruiter runs:

    claude mcp add --transport http nideknil-recruiter <MCP_PUBLIC_URL>/mcp-recruiter \\
        --header "Authorization: Bearer <key>"

Every tool is ownership-checked via the EXISTING `_own_submission()` helper from
routers/assignments.py — a recruiter can only ever query submissions on jobs they own.
Answers are grounded in the already-computed FluencyReport + Application resume data
(services.mcp_bridge.get_merged_candidate_context), never a fresh read of the raw
transcript — keeps cost/latency bounded and never smuggles transcript bytes back out
over the MCP transport either.
"""
from __future__ import annotations

import json

from fastapi import HTTPException
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.server import Context

import models
from database import SessionLocal
from routers.assignments import _own_submission
from services.ai.factory import get_ai_strategy
from services.mcp_bridge import (
    build_transport_security,
    check_auth_failure_rate_limit,
    check_rate_limit,
    get_merged_candidate_context,
    mark_recruiter_key_used,
)

mcp = FastMCP(
    "nideknil-recruiter",
    stateless_http=True,
    streamable_http_path="/",  # mounted at /mcp-recruiter in main.py — NOT nested under
                                # /mcp, see main.py's mount comment for why
    transport_security=build_transport_security(),
)


class AuthError(Exception):
    pass


def _reject(client_ip: str, message: str):
    # Rate-limit is checked HERE (on the failure path only) — never on unvalidated
    # input reaching check_rate_limit(), which would let an attacker grow that log
    # unboundedly by sending a unique garbage key on every request.
    if not check_auth_failure_rate_limit(client_ip):
        raise AuthError("Too many failed attempts from this address — try again in a minute.")
    raise AuthError(message)


def _authenticate(ctx: Context) -> tuple[object, "models.User"]:
    """Returns (db_session, recruiter). Caller is responsible for closing the session."""
    request = ctx.request_context.request
    if request is None:
        raise AuthError("This tool must be called over the HTTP transport.")
    client_ip = request.client.host if request.client else "unknown"

    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        _reject(client_ip, "Missing or invalid Authorization header.")
    key_value = auth.removeprefix("Bearer ").strip()

    db = SessionLocal()
    key = (
        db.query(models.RecruiterMcpApiKey)
        .filter(models.RecruiterMcpApiKey.key == key_value, models.RecruiterMcpApiKey.revoked_at.is_(None))
        .first()
    )
    if not key:
        db.close()
        _reject(client_ip, "Unknown or revoked API key.")

    # Only reachable with a VALIDATED key — keyed by its id, not the raw secret, so
    # this log is bounded by real rows regardless of what's thrown at auth.
    if not check_rate_limit(f"key:{key.id}"):
        db.close()
        raise AuthError("Rate limit exceeded — slow down and try again in a minute.")

    mark_recruiter_key_used(db, key)
    return db, key.recruiter


def _owned_submission(db, submission_id: int, recruiter) -> "models.AssignmentSubmission":
    try:
        return _own_submission(db, submission_id, recruiter)  # raises HTTPException(404/403)
    except HTTPException as exc:
        raise AuthError(exc.detail) from exc


@mcp.tool()
def list_submissions(ctx: Context, job_id: int | None = None) -> list[dict]:
    """List take-home assignment submissions for jobs you own, optionally filtered
    to one job_id."""
    try:
        db, recruiter = _authenticate(ctx)
    except AuthError as exc:
        return [{"error": str(exc)}]
    try:
        query = (
            db.query(models.AssignmentSubmission)
            .join(models.Assignment)
            .filter(models.Assignment.recruiter_id == recruiter.id)
        )
        if job_id is not None:
            query = query.filter(models.Assignment.job_id == job_id)
        subs = query.order_by(models.AssignmentSubmission.invited_at.desc()).all()
        return [
            {
                "submission_id": s.id,
                "candidate_name": s.candidate_name,
                "status": s.status,
                "assignment_title": s.assignment.title,
                "job_title": s.assignment.job.title,
                "overall_score": s.report.overall_score if s.report else None,
            }
            for s in subs
        ]
    finally:
        db.close()


@mcp.tool()
def get_candidate_report(ctx: Context, submission_id: int) -> dict:
    """Get the full AI-fluency report + resume context for one submission you own."""
    try:
        db, recruiter = _authenticate(ctx)
    except AuthError as exc:
        return {"error": str(exc)}
    try:
        submission = _owned_submission(db, submission_id, recruiter)
        return get_merged_candidate_context(db, submission)
    except AuthError as exc:
        return {"error": str(exc)}
    finally:
        db.close()


@mcp.tool()
async def ask_about_candidate(ctx: Context, submission_id: int, question: str) -> str:
    """Ask a free-form question about one candidate's AI-fluency report + resume —
    e.g. "what should I probe on in the interview?"."""
    try:
        db, recruiter = _authenticate(ctx)
    except AuthError as exc:
        return str(exc)
    try:
        submission = _owned_submission(db, submission_id, recruiter)
        context = get_merged_candidate_context(db, submission)
    except AuthError as exc:
        return str(exc)
    finally:
        db.close()

    strategy = get_ai_strategy()
    context_blob = (
        "You are helping a recruiter prep for an interview. Here is everything known "
        f"about the candidate:\n\n{json.dumps(context, default=str, indent=2)}"
    )
    return await strategy.answer_question(context_blob, question)


@mcp.tool()
async def generate_interview_questions(ctx: Context, submission_id: int) -> str:
    """Draft 4-5 interview questions tailored to this candidate's AI-fluency report
    and resume."""
    try:
        db, recruiter = _authenticate(ctx)
    except AuthError as exc:
        return str(exc)
    try:
        submission = _owned_submission(db, submission_id, recruiter)
        context = get_merged_candidate_context(db, submission)
    except AuthError as exc:
        return str(exc)
    finally:
        db.close()

    strategy = get_ai_strategy()
    context_blob = (
        "You are helping a recruiter prep for an interview. Here is everything known "
        f"about the candidate:\n\n{json.dumps(context, default=str, indent=2)}"
    )
    question = (
        "Draft 4-5 specific interview questions for this candidate, grounded in how "
        "they actually collaborated with Claude Code while building the take-home "
        "assignment (per the report above) and their resume. Number them plainly."
    )
    return await strategy.answer_question(context_blob, question)
