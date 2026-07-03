"""
Token-budget enforcement and chunk building.

Raw transcripts are unbounded (real projects measured at 20M+ raw tokens), so
cost is bounded BY CONSTRUCTION here, never by assumption:

  1. Every candidate PROMPT is always kept — it's the primary signal and is
     tiny in practice (<7% of transcript bytes measured on real projects).
  2. Surrounding context (AI responses, tool calls/results) is dropped in
     priority order until the submission fits FLUENCY_TOKEN_BUDGET.
  3. The reduced event stream is packed into chunks of ≤ FLUENCY_CHUNK_TOKENS
     for the judge, split on session boundaries where possible.
"""
from __future__ import annotations

import logging

from config import settings
from services.fluency.events import EventKind, ParsedSession, SessionEvent, estimate_tokens

logger = logging.getLogger(__name__)

_KIND_TAG = {
    EventKind.PROMPT: "[PROMPT]",
    EventKind.RESPONSE: "[AI]",
    EventKind.TOOL_CALL: "[TOOL]",
    EventKind.TOOL_RESULT: "[RESULT]",
}

# When over budget, context events are shrunk/dropped in this order.
_RESPONSE_TIGHT = 1_200
_TOOL_CALL_TIGHT = 300


def render_event(e: SessionEvent) -> str:
    tag = _KIND_TAG[e.kind]
    ts = e.timestamp.strftime("%m-%d %H:%M") if e.timestamp else "--"
    tool = f" {e.tool_name}" if e.tool_name else ""
    err = " (ERROR)" if e.meta.get("is_error") else ""
    return f"{tag}{tool}{err} ({ts})\n{e.content}"


def enforce_budget(sessions: list[ParsedSession]) -> tuple[list[ParsedSession], dict]:
    """
    Reduce sessions in place until the rendered size fits the token budget.
    Prompts are never dropped. Returns (sessions, reduction_stats).
    """
    budget_chars = settings.FLUENCY_TOKEN_BUDGET * 4

    def total_chars() -> int:
        return sum(s.char_count for s in sessions)

    stats = {"initial_tokens_est": estimate_tokens(total_chars()), "reductions": []}

    # Pass 1: drop tool RESULTS (keep error results — they carry debugging signal)
    if total_chars() > budget_chars:
        for s in sessions:
            s.events = [e for e in s.events
                        if e.kind != EventKind.TOOL_RESULT or e.meta.get("is_error")]
        stats["reductions"].append("dropped_ok_tool_results")

    # Pass 2: tighten AI responses and tool-call inputs
    if total_chars() > budget_chars:
        for s in sessions:
            for e in s.events:
                if e.kind == EventKind.RESPONSE and len(e.content) > _RESPONSE_TIGHT:
                    e.content = e.content[:_RESPONSE_TIGHT] + " …"
                elif e.kind == EventKind.TOOL_CALL and len(e.content) > _TOOL_CALL_TIGHT:
                    e.content = e.content[:_TOOL_CALL_TIGHT] + " …"
        stats["reductions"].append("tightened_responses_and_tool_calls")

    # Pass 3: drop error tool results too, keep only prompts + responses + tool names
    if total_chars() > budget_chars:
        for s in sessions:
            s.events = [e for e in s.events if e.kind != EventKind.TOOL_RESULT]
        stats["reductions"].append("dropped_all_tool_results")

    # Pass 4 (extreme): prompts + trimmed responses only. Prompts survive always.
    if total_chars() > budget_chars:
        for s in sessions:
            s.events = [e for e in s.events
                        if e.kind in (EventKind.PROMPT, EventKind.RESPONSE)]
        stats["reductions"].append("prompts_and_responses_only")

    stats["final_tokens_est"] = estimate_tokens(total_chars())
    if stats["reductions"]:
        logger.info("Fluency budget enforcement: %s → %s est tokens via %s",
                    stats["initial_tokens_est"], stats["final_tokens_est"],
                    stats["reductions"])
    return sessions, stats


def build_chunks(sessions: list[ParsedSession]) -> list[str]:
    """
    Pack rendered events into chunk strings of ≤ FLUENCY_CHUNK_TOKENS,
    preserving chronological order and preferring session boundaries.
    """
    chunk_chars = settings.FLUENCY_CHUNK_TOKENS * 4
    ordered = sorted(
        sessions,
        key=lambda s: (s.started_at is None, s.started_at),
    )

    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    def flush():
        nonlocal current, current_len
        if current:
            chunks.append("\n\n".join(current))
            current, current_len = [], 0

    for s in ordered:
        header = f"=== SESSION {s.session_id[:8]} ({s.started_at or 'no timestamp'}) ==="
        blocks = [header] + [render_event(e) for e in s.events]
        for block in blocks:
            if current_len + len(block) > chunk_chars and current:
                flush()
            # A single oversized block still goes in alone (hard-capped upstream).
            current.append(block)
            current_len += len(block) + 2
    flush()
    return chunks
