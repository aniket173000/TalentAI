"""
Recruiter Voice Copilot — mints OpenAI Realtime ephemeral client secrets so a
recruiter's BROWSER can connect directly to OpenAI over WebRTC. This backend
never proxies audio; its only job is this one REST call plus the guardrails
below (no WebSocket/media-relay infra exists in this codebase, and we're not
building one for v1 — see PRPs/plans/voice-copilot for the tradeoff).

The candidate context embedded as `instructions` is built once per mint via
services.mcp_bridge.get_merged_candidate_context — the SAME function the
text-based ask_about_candidate MCP tool uses (routers/mcp_recruiter.py). No
live function-calling back to this backend during the call: the context is
static for the life of one submission, so there's nothing a tool-call would
fetch that isn't already known at session start.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.orm import Session

import models
from config import settings

_REALTIME_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets"


class VoiceSessionError(Exception):
    pass


# ── cost/abuse guardrails (in-process only — this backend runs single-worker,
#    same assumption already documented in services/mcp_bridge.py) ────────────
#
# A SEPARATE, tighter window than mcp_bridge's check_rate_limit: that one is
# sized for cheap JSON tool calls (30/min); minting a per-minute-billed audio
# session needs a much smaller budget.
_MINT_WINDOW = timedelta(minutes=10)
_MINT_MAX_PER_WINDOW = 5
_mint_log: dict[int, list[datetime]] = {}


def check_mint_rate_limit(recruiter_id: int) -> bool:
    now = datetime.now(timezone.utc)
    calls = [t for t in _mint_log.get(recruiter_id, []) if now - t < _MINT_WINDOW]
    calls.append(now)
    _mint_log[recruiter_id] = calls
    return len(calls) <= _MINT_MAX_PER_WINDOW


def has_active_session(db: Session, submission_id: int) -> bool:
    """One active voice session per submission at a time — catches both a
    reconnect-loop bug and multiple tabs opened against the same candidate."""
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=settings.VOICE_SESSION_MAX_DURATION_SECONDS)
    return (
        db.query(models.VoiceSession)
        .filter(
            models.VoiceSession.submission_id == submission_id,
            models.VoiceSession.ended_at.is_(None),
            models.VoiceSession.minted_at > cutoff,
        )
        .first()
        is not None
    )


async def mint_realtime_session(context_blob: str) -> dict:
    """
    Calls OpenAI's Realtime client-secret endpoint and returns
    {"client_secret": str, "expires_at": iso8601 str, "model": str}.

    NOTE: the exact request/response shape of OpenAI's realtime ephemeral-token
    endpoint has moved across beta revisions — verify this against LIVE OpenAI
    docs before deploying, do not trust this shape blindly.
    """
    if not settings.OPENAI_API_KEY:
        raise VoiceSessionError("OPENAI_API_KEY is not configured")

    instructions = (
        "You are a live voice copilot helping a recruiter prep for an interview. "
        "Speak naturally and concisely. Here is everything known about the "
        f"candidate:\n\n{context_blob}"
    )

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            _REALTIME_CLIENT_SECRETS_URL,
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
            json={
                "session": {
                    "type": "realtime",
                    "model": settings.REALTIME_MODEL,
                    "instructions": instructions,
                    "audio": {"output": {"voice": settings.REALTIME_VOICE}},
                },
                "expires_after": {
                    "anchor": "created_at",
                    "seconds": settings.VOICE_SESSION_MAX_DURATION_SECONDS,
                },
            },
        )

    if resp.status_code != 200:
        raise VoiceSessionError(f"OpenAI realtime mint failed: {resp.status_code} {resp.text}")

    data = resp.json()
    return {
        "client_secret": data["value"],
        "expires_at": data.get("expires_at"),
        "model": settings.REALTIME_MODEL,
    }
