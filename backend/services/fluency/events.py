"""
Normalized transcript event schema.

Everything downstream of ingestion (deterministic metrics, the LLM judge,
report rendering) operates ONLY on SessionEvent — never on raw tool formats.
That makes each AI tool a parser adapter: Claude Code today, Codex CLI /
Aider / Gemini CLI later, without touching the scoring pipeline.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class EventKind(str, Enum):
    PROMPT = "prompt"            # candidate's typed message
    RESPONSE = "response"        # assistant text shown to the candidate
    TOOL_CALL = "tool_call"      # assistant invoked a tool (edit, bash, read…)
    TOOL_RESULT = "tool_result"  # what the tool returned (truncated)


@dataclass
class SessionEvent:
    source_tool: str            # "claude_code" | future adapters
    session_id: str
    kind: EventKind
    content: str
    timestamp: datetime | None = None
    tool_name: str | None = None    # for TOOL_CALL / TOOL_RESULT
    meta: dict = field(default_factory=dict)


@dataclass
class ParsedSession:
    session_id: str
    source_tool: str
    events: list[SessionEvent]
    started_at: datetime | None = None
    ended_at: datetime | None = None

    @property
    def char_count(self) -> int:
        return sum(len(e.content) for e in self.events)


def estimate_tokens(text_or_chars: str | int) -> int:
    """Cheap chars/4 token estimate — good enough for budgeting, not billing."""
    n = text_or_chars if isinstance(text_or_chars, int) else len(text_or_chars)
    return n // 4
