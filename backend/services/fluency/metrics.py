"""
Deterministic transcript metrics + integrity flags.

Computed from normalized events before any LLM call — free, reproducible, and
used both directly in the report and as grounding context for the judge.
"""
from __future__ import annotations

import re
import statistics
from datetime import timedelta, timezone

from services.fluency.events import EventKind, ParsedSession

# bash commands that indicate the candidate verified work (tests, builds, runs)
_VERIFY_CMD = re.compile(
    r"\b(pytest|unittest|npm (?:run )?test|yarn test|vitest|jest|go test|cargo test|"
    r"mvn test|gradle test|rspec|phpunit|tsc\b|mypy|ruff|eslint|flake8|"
    r"curl |http |docker compose|make test)",
    re.IGNORECASE,
)

_WORK_SESSION_GAP = timedelta(minutes=30)   # gap that splits distinct work bursts


def compute_metrics(sessions: list[ParsedSession]) -> dict:
    prompts, responses, tool_calls, tool_results = [], [], [], []
    error_results = 0
    verify_runs = 0
    tool_mix: dict[str, int] = {}

    for s in sessions:
        for e in s.events:
            if e.kind == EventKind.PROMPT:
                prompts.append(e)
            elif e.kind == EventKind.RESPONSE:
                responses.append(e)
            elif e.kind == EventKind.TOOL_CALL:
                tool_calls.append(e)
                name = e.tool_name or "unknown"
                tool_mix[name] = tool_mix.get(name, 0) + 1
                if name.lower() == "bash" and _VERIFY_CMD.search(e.content):
                    verify_runs += 1
            elif e.kind == EventKind.TOOL_RESULT:
                tool_results.append(e)
                if e.meta.get("is_error"):
                    error_results += 1

    prompt_lengths = [len(p.content) for p in prompts]
    timestamps = sorted(
        t for s in sessions for t in (s.started_at, s.ended_at) if t
    )

    # Distinct work bursts: split the event timeline on >30min gaps.
    all_ts = sorted(e.timestamp for s in sessions for e in s.events if e.timestamp)
    bursts = 0
    active_seconds = 0.0
    if all_ts:
        bursts = 1
        burst_start = prev = all_ts[0]
        for t in all_ts[1:]:
            if t - prev > _WORK_SESSION_GAP:
                active_seconds += (prev - burst_start).total_seconds()
                bursts += 1
                burst_start = t
            prev = t
        active_seconds += (prev - burst_start).total_seconds()

    return {
        "sessions": len(sessions),
        "prompts": len(prompts),
        "responses": len(responses),
        "tool_calls": len(tool_calls),
        "tool_results": len(tool_results),
        "tool_errors": error_results,
        "error_rate": round(error_results / len(tool_results), 3) if tool_results else 0.0,
        "verification_runs": verify_runs,
        "tool_mix": dict(sorted(tool_mix.items(), key=lambda kv: -kv[1])[:15]),
        "prompt_length_median": int(statistics.median(prompt_lengths)) if prompt_lengths else 0,
        "prompt_length_max": max(prompt_lengths, default=0),
        "work_bursts": bursts,
        "active_hours": round(active_seconds / 3600, 2),
        "first_activity": timestamps[0].isoformat() if timestamps else None,
        "last_activity": timestamps[-1].isoformat() if timestamps else None,
        "wall_clock_hours": round(
            (timestamps[-1] - timestamps[0]).total_seconds() / 3600, 2
        ) if len(timestamps) >= 2 else 0.0,
    }


def correlate_git(metrics: dict, git: dict | None) -> list[dict]:
    """
    Cross-check git history (captured by the submit CLI) against the transcript
    timeline. Strengthens integrity signal: a repo whose commits cluster far
    outside the transcript's working window suggests the project was built
    elsewhere and the transcript re-narrated. Returns extra integrity flags.
    Absent git metadata (web uploads) → no flags, no penalty.
    """
    if not git or not isinstance(git, dict):
        return []

    flags: list[dict] = []
    commit_count = git.get("commit_count") or 0

    # A substantial project with almost no commits during the transcript window
    # is worth a gentle flag (could be a single squashed commit, could be a
    # pre-built repo).
    if commit_count == 0 and metrics.get("tool_calls", 0) > 20:
        flags.append({
            "code": "git_no_commits", "severity": "low",
            "detail": "The submitted repo has no commits, yet the transcript shows "
                      "substantial file activity — verify the work was committed here.",
        })

    # Compare git's first→last commit span to the transcript's wall-clock window.
    first, last = git.get("first_commit_ts"), git.get("last_commit_ts")
    tx_first, tx_last = metrics.get("first_activity"), metrics.get("last_activity")
    if first and last and tx_first and tx_last:
        try:
            from datetime import datetime
            gf = datetime.fromtimestamp(int(first), tz=timezone.utc)
            gl = datetime.fromtimestamp(int(last), tz=timezone.utc)
            tf = datetime.fromisoformat(tx_first)
            tl = datetime.fromisoformat(tx_last)
            # If the majority of commit activity predates the transcript entirely,
            # the code likely existed before this session.
            if gl < tf - timedelta(hours=6):
                flags.append({
                    "code": "git_predates_transcript", "severity": "medium",
                    "detail": "The repo's most recent commit predates the transcript by "
                              "hours — the code may have been written before this session.",
                })
        except (ValueError, OSError, TypeError):
            pass
    return flags


def compute_integrity_flags(sessions: list[ParsedSession], metrics: dict,
                            scrub_stats: dict | None = None) -> tuple[list[dict], str]:
    """
    Heuristic integrity signals. These FLAG anomalies — they never claim
    certainty; consent-based transcript submission is inherently gameable and
    the report says so via the confidence level.

    Returns (flags, confidence) with confidence ∈ high|medium|low.
    """
    flags: list[dict] = []

    if metrics["prompts"] < 5:
        flags.append({
            "code": "very_few_prompts", "severity": "high",
            "detail": f"Only {metrics['prompts']} candidate prompts across the whole "
                      f"submission — too little interaction to have built a project.",
        })

    if metrics["sessions"] == 1 and metrics["wall_clock_hours"] <= 1.0 and metrics["prompts"] >= 5:
        flags.append({
            "code": "single_short_burst", "severity": "medium",
            "detail": "Entire project 'built' in a single session under an hour — "
                      "consistent with replaying a rehearsed script.",
        })

    no_ts = sum(1 for s in sessions if not s.started_at)
    if sessions and no_ts / len(sessions) > 0.5:
        flags.append({
            "code": "missing_timestamps", "severity": "medium",
            "detail": f"{no_ts}/{len(sessions)} session files lack timestamps — "
                      f"possible manual editing of the transcript.",
        })

    if metrics["tool_calls"] == 0 and metrics["prompts"] > 0:
        flags.append({
            "code": "no_tool_activity", "severity": "high",
            "detail": "No file edits, commands, or tool activity — this looks like a "
                      "chat log, not a Claude Code build session.",
        })

    if metrics["prompts"] > 0 and metrics["prompt_length_median"] > 4000:
        flags.append({
            "code": "paste_heavy_prompts", "severity": "low",
            "detail": "Median prompt is unusually long — prompts may be pasted "
                      "specs rather than interactive direction.",
        })

    if scrub_stats and scrub_stats.get("secrets_redacted", 0) > 0:
        flags.append({
            "code": "secrets_redacted", "severity": "info",
            "detail": f"{scrub_stats['secrets_redacted']} credential-like strings were "
                      f"redacted at upload (not shown to anyone).",
        })

    severe = sum(1 for f in flags if f["severity"] == "high")
    medium = sum(1 for f in flags if f["severity"] == "medium")
    if severe:
        confidence = "low"
    elif medium:
        confidence = "medium"
    else:
        confidence = "high"
    return flags, confidence
