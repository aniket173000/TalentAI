"""
Claude Code MCP companion for an invited candidate's take-home Assignment.

Auth: the SAME `AssignmentSubmission.access_token` already emailed at invite time
(routers/assignments.py's `_send_invite_email`) — no new token model. A candidate runs:

    claude mcp add --transport http nideknil-assignment <MCP_PUBLIC_URL>/mcp/ \\
        --header "Authorization: Bearer <access_token>"

Tools are read-only orientation only — brief + how-to-submit. Transcript file bytes are
NEVER passed through an MCP tool call; submission stays on the existing web-upload/CLI
paths (see PRP "Known Gotchas" for why: a candidate's own Claude Code would have to read
the whole multi-MB .jsonl into ITS OWN context just to pass it as a tool argument).
"""
from __future__ import annotations

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.server import Context

from config import settings
from database import SessionLocal
from routers.assignments import _by_token, candidate_view
from services.mcp_bridge import (
    build_transport_security,
    check_auth_failure_rate_limit,
    check_rate_limit,
    mark_mcp_connected,
)

mcp = FastMCP(
    "nideknil-assignment",
    stateless_http=True,
    streamable_http_path="/",  # mounted at /mcp in main.py — see Known Gotchas re: default "/mcp" path
    transport_security=build_transport_security(),
)


class AuthError(Exception):
    """Raised by _authenticate and returned to the caller as a tool error string —
    MCP tools aren't FastAPI endpoints, so HTTPException doesn't apply here."""


def _reject(client_ip: str, message: str):
    # Rate-limit is checked HERE (on the failure path only) — never on unvalidated
    # input reaching check_rate_limit(), which would let an attacker grow that log
    # unboundedly by sending a unique garbage token on every request.
    if not check_auth_failure_rate_limit(client_ip):
        raise AuthError("Too many failed attempts from this address — try again in a minute.")
    raise AuthError(message)


def _authenticate(ctx: Context) -> tuple[object, object]:
    """Returns (db_session, submission). Caller is responsible for closing the session."""
    request = ctx.request_context.request
    if request is None:
        raise AuthError("This tool must be called over the HTTP transport.")
    client_ip = request.client.host if request.client else "unknown"

    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        _reject(client_ip, "Missing or invalid Authorization header.")
    token = auth.removeprefix("Bearer ").strip()

    db = SessionLocal()
    try:
        submission = _by_token(db, token)  # raises HTTPException(404) if unknown
    except Exception:
        db.close()
        _reject(client_ip, "Unknown or invalid assignment link.")

    # Only reachable with a VALIDATED submission — keyed by its id, not the raw
    # token, so this log is bounded by real rows regardless of what's thrown at auth.
    if not check_rate_limit(f"submission:{submission.id}"):
        db.close()
        raise AuthError("Rate limit exceeded — slow down and try again in a minute.")

    mark_mcp_connected(db, submission)
    return db, submission


@mcp.tool()
def get_assignment_brief(ctx: Context) -> dict:
    """Fetch this assignment's brief, deadline, and current status."""
    try:
        db, submission = _authenticate(ctx)
    except AuthError as exc:
        return {"error": str(exc)}
    try:
        view = candidate_view(submission.access_token, db)
        return view.model_dump(mode="json")
    finally:
        db.close()


@mcp.tool()
def get_submission_instructions(ctx: Context) -> str:
    """Get the exact command to run once the assignment is built, to submit your
    Claude Code session transcript for AI-fluency scoring."""
    try:
        db, submission = _authenticate(ctx)
    except AuthError as exc:
        return str(exc)
    try:
        token = submission.access_token
        portal_url = f"{settings.FRONTEND_URL}/assignment/{token}"
        return (
            "When you're done building the assignment, submit your Claude Code session "
            f"transcript one of two ways:\n\n"
            f"  npx nideknil-submit {token}\n\n"
            f"or upload the .jsonl files directly at:\n  {portal_url}\n\n"
            "Either way, your transcript is scrubbed of secrets before storage and scored "
            "against the brief above."
        )
    finally:
        db.close()
