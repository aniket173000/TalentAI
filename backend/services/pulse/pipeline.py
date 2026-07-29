"""
Pulse analysis pipeline.

Delegates almost entirely to the fluency engine (parse → metrics → integrity →
judge → normalize), but in the brief-free "general work" mode and writing a
PulseReport instead of a FluencyReport. Dispatch contract mirrors the fluency
pipeline: USE_CELERY → durable task, else an in-process daemon thread. The
submitted→processing transition is a compare-and-set so a double-dispatch runs
the analysis exactly once.
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
from datetime import datetime, timezone

import models
from config import settings
from database import SessionLocal
from services.fluency.chunking import build_chunks, enforce_budget
from services.fluency.judge import get_fluency_judge
from services.fluency.metrics import compute_integrity_flags, compute_metrics, correlate_git
# Reuse the deterministic report-shaping helpers — identical contract.
from services.fluency.pipeline import _normalize_dimensions, _weighted_overall
from services.fluency.transcript_parser import TranscriptParseError, parse_claude_code_jsonl
from services.pulse import store

logger = logging.getLogger(__name__)


def dispatch_pulse_analysis(submission_id: int) -> str:
    """Queue the analysis. Returns 'celery' or 'thread'."""
    if settings.USE_CELERY:
        try:
            from services.tasks import run_pulse_analysis_task
            run_pulse_analysis_task.delay(submission_id)
            return "celery"
        except Exception as exc:
            logger.error("Pulse Celery dispatch failed (%s); falling back to thread", exc)

    t = threading.Thread(target=execute_pulse_analysis, args=(submission_id,), daemon=True)
    t.start()
    return "thread"


def execute_pulse_analysis(submission_id: int) -> None:
    """Worker body — owns its DB session and event loop."""
    db = SessionLocal()
    try:
        claimed = (
            db.query(models.PulseSubmission)
            .filter(
                models.PulseSubmission.id == submission_id,
                models.PulseSubmission.status.in_(["submitted", "failed"]),
            )
            .update(
                {
                    "status": "processing",
                    "error": None,
                    "attempts": models.PulseSubmission.attempts + 1,
                },
                synchronize_session=False,
            )
        )
        db.commit()
        if not claimed:
            logger.info("Pulse %s: not claimable (already processing/analyzed)", submission_id)
            return

        submission = db.get(models.PulseSubmission, submission_id)
        report_payload = asyncio.run(_analyze(submission))

        db.query(models.PulseReport).filter(
            models.PulseReport.submission_id == submission_id
        ).delete(synchronize_session=False)
        db.add(models.PulseReport(
            submission_id=submission_id,
            org_id=submission.org_id,
            seat_id=submission.seat_id,
            period_id=submission.period_id,
            **report_payload,
        ))

        submission = db.get(models.PulseSubmission, submission_id)
        submission.status = "analyzed"
        submission.analyzed_at = datetime.now(timezone.utc)
        db.commit()
        logger.info("Pulse %s: ANALYZED overall=%s provider=%s tokens~%s",
                    submission_id, report_payload["overall_score"],
                    report_payload.get("provider"), report_payload.get("input_tokens_est"))

    except Exception as exc:
        logger.exception("Pulse analysis failed for submission %s", submission_id)
        db.rollback()
        try:
            submission = db.get(models.PulseSubmission, submission_id)
            if submission:
                submission.status = "failed"
                submission.error = str(exc)[:2000]
                db.commit()
        except Exception:
            db.rollback()
    finally:
        db.close()


async def _analyze(submission: models.PulseSubmission) -> dict:
    keys: list[str] = json.loads(submission.transcript_file_keys or "[]")
    if not keys:
        raise RuntimeError("Submission has no transcript files")

    sessions = []
    parse_failures = []
    for key in keys:
        raw = store.load_transcript(key)
        if raw is None:
            parse_failures.append(f"{key}: unreadable")
            continue
        try:
            sessions.append(parse_claude_code_jsonl(raw, fallback_session_id=key[-12:]))
        except TranscriptParseError as exc:
            parse_failures.append(f"{key}: {exc}")

    if not sessions:
        raise RuntimeError(f"No parseable transcript files ({'; '.join(parse_failures[:3])})")

    metrics = compute_metrics(sessions)
    metrics["files_uploaded"] = len(keys)
    metrics["files_unparseable"] = len(parse_failures)

    flags, _ = compute_integrity_flags(sessions, metrics)
    if parse_failures:
        flags.append({
            "code": "unparseable_files", "severity": "medium",
            "detail": f"{len(parse_failures)} uploaded file(s) were not valid Claude Code "
                      f"transcripts and were skipped.",
        })

    git = None
    if submission.git_metadata:
        try:
            git = json.loads(submission.git_metadata)
        except (ValueError, TypeError):
            git = None
    if git:
        metrics["git"] = git
        flags.extend(correlate_git(metrics, git))

    severe = sum(1 for f in flags if f["severity"] == "high")
    medium = sum(1 for f in flags if f["severity"] == "medium")
    integrity_confidence = "low" if severe else "medium" if medium else "high"

    sessions, budget_stats = enforce_budget(sessions)
    chunks = build_chunks(sessions)
    judge = get_fluency_judge()

    work_note = submission.work_note or ""
    logger.info("Pulse %s: parsed %d sessions (%d prompts, %d tool calls) → %d chunks, "
                "judging general-work with %s",
                submission.id, len(sessions), metrics["prompts"], metrics["tool_calls"],
                len(chunks), judge.chunk_model)

    chunk_results = await judge.score_chunks(chunks, work_note, None, general_work=True)
    final = await judge.aggregate(chunk_results, metrics, flags, work_note, None,
                                  general_work=True)

    dimensions = _normalize_dimensions(final.get("dimensions"))
    overall = _weighted_overall(dimensions)

    return {
        "overall_score": overall,
        "summary": final.get("summary") or "",
        "dimensions": json.dumps(dimensions, ensure_ascii=False),
        "highlights": json.dumps(final.get("highlights") or {}, ensure_ascii=False),
        "metrics": json.dumps({**metrics, "budget": budget_stats}, ensure_ascii=False),
        "integrity_flags": json.dumps(flags, ensure_ascii=False),
        "integrity_confidence": integrity_confidence,
        "provider": judge.provider,
        "chunk_model": judge.chunk_model,
        "aggregate_model": judge.aggregate_model,
        "input_tokens_est": budget_stats.get("final_tokens_est"),
    }
