"""
Claude Code MCP companion for a Pulse engineer seat.

Auth: the engineer's long-lived `OrgSeat.seat_token` (a static CLI/MCP bearer,
mirroring the RecruiterMcpApiKey pattern — NOT a JWT). An engineer connects once:

    claude mcp add --transport http nideknil-pulse <PULSE_MCP_PUBLIC_URL>/mcp-pulse/ \\
        --header "Authorization: Bearer <seat_token>"

Tools are orientation + status only. Transcript file BYTES are never passed
through an MCP tool call (large/image-heavy) — submission stays on the
CLI/web-upload HTTP path (same constraint as the candidate/recruiter servers).
"""
from __future__ import annotations

from datetime import datetime, timezone

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.server import Context

import models
from config import settings
from database import SessionLocal
from services.mcp_bridge import (
    build_transport_security,
    check_auth_failure_rate_limit,
    check_rate_limit,
)

mcp = FastMCP(
    "nideknil-pulse",
    stateless_http=True,
    streamable_http_path="/",   # mounted at /mcp-pulse in main.py
    transport_security=build_transport_security(),
)


class AuthError(Exception):
    """Returned to the caller as a tool-error string (MCP tools aren't endpoints)."""


def _reject(client_ip: str, message: str):
    if not check_auth_failure_rate_limit(client_ip):
        raise AuthError("Too many failed attempts from this address — try again in a minute.")
    raise AuthError(message)


def _authenticate(ctx: Context) -> tuple[object, models.OrgSeat]:
    """Returns (db_session, seat). Caller must close the session."""
    request = ctx.request_context.request
    if request is None:
        raise AuthError("This tool must be called over the HTTP transport.")
    client_ip = request.client.host if request.client else "unknown"

    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        _reject(client_ip, "Missing or invalid Authorization header.")
    token = auth.removeprefix("Bearer ").strip()

    db = SessionLocal()
    seat = db.query(models.OrgSeat).filter(models.OrgSeat.seat_token == token).first()
    if not seat or seat.status == "revoked" or seat.revoked_at is not None:
        db.close()
        _reject(client_ip, "Unknown or revoked Pulse link.")

    if not check_rate_limit(f"pulse_seat:{seat.id}"):
        db.close()
        raise AuthError("Rate limit exceeded — slow down and try again in a minute.")

    now = datetime.now(timezone.utc)
    if seat.connected_at is None:
        seat.connected_at = now
    seat.last_seen_at = now
    db.commit()
    return db, seat


@mcp.tool()
def get_my_report_status(ctx: Context) -> dict:
    """Check your latest AI Fluency Pulse submission status and score (your own only)."""
    try:
        db, seat = _authenticate(ctx)
    except AuthError as exc:
        return {"error": str(exc)}
    try:
        latest = (db.query(models.PulseSubmission)
                  .filter(models.PulseSubmission.seat_id == seat.id)
                  .order_by(models.PulseSubmission.submitted_at.desc()).first())
        if not latest:
            return {"org": seat.organization.name, "status": "no_submissions_yet",
                    "hint": "Run the submit command to send this period's sessions."}
        score = latest.report.overall_score if latest.report else None
        return {
            "org": seat.organization.name,
            "cadence": seat.organization.cadence,
            "status": latest.status,
            "overall_score": score,
            "submitted_at": latest.submitted_at.isoformat() if latest.submitted_at else None,
        }
    finally:
        db.close()


@mcp.tool()
def submit_recent_sessions(ctx: Context) -> str:
    """Get the exact command to submit this period's Claude Code sessions for AI-fluency
    scoring. (Transcripts upload over HTTP, never through this MCP tool.)"""
    try:
        db, seat = _authenticate(ctx)
    except AuthError as exc:
        return str(exc)
    try:
        token = seat.seat_token
        portal_url = f"{settings.FRONTEND_URL}/pulse/portal/{token}"
        return (
            "To submit this period's sessions, run this from inside your project folder:\n\n"
            f"  npx nideknil-submit {token} --pulse\n\n"
            f"or upload the .jsonl files at:\n  {portal_url}\n\n"
            "Your transcript is scrubbed of secrets locally and server-side before storage. "
            "Only you see your individual report; your team sees aggregates."
        )
    finally:
        db.close()
