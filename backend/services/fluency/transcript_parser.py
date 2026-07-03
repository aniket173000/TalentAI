"""
Claude Code JSONL → normalized SessionEvent adapter.

Claude Code stores each session at ~/.claude/projects/<slug>/<session>.jsonl.
Record types observed in real transcripts (and how we treat them):

  user                 → PROMPT (typed text) and/or TOOL_RESULT blocks
  assistant            → RESPONSE (text) + TOOL_CALL blocks; thinking dropped
  file-history-snapshot, attachment, ai-title, last-prompt,
  queue-operation, summary, …                             → dropped (metadata)

Signal-preserving reductions (measured on real transcripts, these cut ~75%
of bytes while keeping 100% of what the rubric scores):
  * base64 images / documents dropped entirely
  * thinking blocks dropped (Claude's reasoning, not the candidate's skill)
  * tool_use inputs trimmed (file bodies in Write/Edit calls)
  * tool_result content truncated head+tail
  * sidechain (subagent) records skipped — agent-to-agent traffic
  * harness-injected tags stripped out of user text (<system-reminder>,
    <ide_selection>, <local-command-*>, <command-*>) so PROMPT events contain
    only what the candidate actually typed
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone

from services.fluency.events import EventKind, ParsedSession, SessionEvent

logger = logging.getLogger(__name__)

SOURCE_TOOL = "claude_code"

# Content limits (chars) applied per block at parse time.
_TOOL_INPUT_MAX = 1_500
_TOOL_RESULT_HEAD = 700
_TOOL_RESULT_TAIL = 300
_RESPONSE_MAX = 6_000
_PROMPT_MAX = 20_000          # keep prompts nearly whole — they're the signal

# Harness-injected spans that appear inside user message text but were not
# typed by the candidate.
_INJECTED_TAG_RE = re.compile(
    r"<(system-reminder|ide_selection|ide_opened_file|ide_diagnostics|"
    r"local-command-caveat|local-command-stdout|local-command-stderr|"
    r"command-name|command-message|command-args|command-contents)>"
    r".*?</\1>",
    re.DOTALL,
)

_RECORD_TYPES_KEPT = {"user", "assistant"}


class TranscriptParseError(Exception):
    """Raised when a file is not a recognizable Claude Code transcript."""


def _ts(value) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def _truncate_middle(text: str, head: int, tail: int) -> str:
    if len(text) <= head + tail + 40:
        return text
    omitted = len(text) - head - tail
    return f"{text[:head]}\n…[{omitted} chars omitted]…\n{text[-tail:]}"


def _clean_prompt_text(text: str) -> str:
    """Strip harness-injected tags; return only candidate-typed content."""
    cleaned = _INJECTED_TAG_RE.sub("", text)
    return cleaned.strip()


def _flatten_tool_result(content) -> str:
    """tool_result content is a str or a list of blocks; images are dropped."""
    if isinstance(content, str):
        return content
    parts: list[str] = []
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            # image / document blocks in tool results: dropped
    return "\n".join(parts)


def parse_claude_code_jsonl(raw: bytes, fallback_session_id: str) -> ParsedSession:
    """
    Parse one Claude Code session file into a ParsedSession.
    Tolerant of unknown record types and malformed lines (logged, skipped);
    raises TranscriptParseError only when nothing parseable is found.
    """
    events: list[SessionEvent] = []
    session_id = fallback_session_id
    total_lines = 0
    bad_lines = 0

    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        total_lines += 1
        try:
            rec = json.loads(line)
        except (json.JSONDecodeError, UnicodeDecodeError):
            bad_lines += 1
            continue
        if not isinstance(rec, dict):
            bad_lines += 1
            continue

        rec_type = rec.get("type")
        if rec.get("sessionId"):
            session_id = rec["sessionId"]
        if rec_type not in _RECORD_TYPES_KEPT:
            continue
        # Subagent traffic and harness-meta records aren't candidate behavior.
        if rec.get("isSidechain") or rec.get("isMeta"):
            continue

        message = rec.get("message") or {}
        content = message.get("content")
        ts = _ts(rec.get("timestamp"))

        if rec_type == "user":
            _parse_user_record(content, ts, session_id, events)
        else:
            _parse_assistant_record(content, ts, session_id, events)

    if not events:
        if total_lines == 0 or bad_lines == total_lines:
            raise TranscriptParseError("File is not JSONL")
        raise TranscriptParseError("No candidate/assistant events found — not a Claude Code transcript?")

    timestamps = [e.timestamp for e in events if e.timestamp]
    return ParsedSession(
        session_id=session_id,
        source_tool=SOURCE_TOOL,
        events=events,
        started_at=min(timestamps) if timestamps else None,
        ended_at=max(timestamps) if timestamps else None,
    )


def _parse_user_record(content, ts, session_id: str, events: list[SessionEvent]) -> None:
    if isinstance(content, str):
        text = _clean_prompt_text(content)
        if text:
            events.append(SessionEvent(
                source_tool=SOURCE_TOOL, session_id=session_id,
                kind=EventKind.PROMPT, content=text[:_PROMPT_MAX], timestamp=ts,
            ))
        return

    if not isinstance(content, list):
        return

    for block in content:
        if not isinstance(block, dict):
            continue
        btype = block.get("type")
        if btype == "text":
            text = _clean_prompt_text(block.get("text", ""))
            if text:
                events.append(SessionEvent(
                    source_tool=SOURCE_TOOL, session_id=session_id,
                    kind=EventKind.PROMPT, content=text[:_PROMPT_MAX], timestamp=ts,
                ))
        elif btype == "tool_result":
            text = _flatten_tool_result(block.get("content"))
            is_error = bool(block.get("is_error"))
            if text or is_error:
                events.append(SessionEvent(
                    source_tool=SOURCE_TOOL, session_id=session_id,
                    kind=EventKind.TOOL_RESULT,
                    content=_truncate_middle(text, _TOOL_RESULT_HEAD, _TOOL_RESULT_TAIL),
                    timestamp=ts,
                    meta={"is_error": is_error},
                ))
        # image / document blocks: dropped


def _parse_assistant_record(content, ts, session_id: str, events: list[SessionEvent]) -> None:
    if not isinstance(content, list):
        if isinstance(content, str) and content.strip():
            events.append(SessionEvent(
                source_tool=SOURCE_TOOL, session_id=session_id,
                kind=EventKind.RESPONSE, content=content.strip()[:_RESPONSE_MAX], timestamp=ts,
            ))
        return

    for block in content:
        if not isinstance(block, dict):
            continue
        btype = block.get("type")
        if btype == "text":
            text = (block.get("text") or "").strip()
            if text:
                events.append(SessionEvent(
                    source_tool=SOURCE_TOOL, session_id=session_id,
                    kind=EventKind.RESPONSE, content=text[:_RESPONSE_MAX], timestamp=ts,
                ))
        elif btype == "tool_use":
            name = block.get("name") or "unknown_tool"
            try:
                tool_input = json.dumps(block.get("input", {}), ensure_ascii=False)
            except (TypeError, ValueError):
                tool_input = str(block.get("input"))
            events.append(SessionEvent(
                source_tool=SOURCE_TOOL, session_id=session_id,
                kind=EventKind.TOOL_CALL,
                content=tool_input[:_TOOL_INPUT_MAX],
                timestamp=ts,
                tool_name=name,
            ))
        # thinking / redacted_thinking: dropped
