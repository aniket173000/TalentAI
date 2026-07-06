"""
Analysis pipeline orchestrator.

dispatch_fluency_analysis() mirrors the ranking funnel's dispatch contract:
USE_CELERY=true → durable Celery task; otherwise an in-process daemon thread.
execute_fluency_analysis() is the worker body, called identically by both, so
the pipeline behaves the same in dev and production.

Concurrency safety: the submitted→processing transition is a compare-and-set
UPDATE, so a double-dispatch (retry click + queued task) results in exactly
one analysis run.
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
from services.fluency import store
from services.fluency.chunking import build_chunks, enforce_budget
from services.fluency.judge import get_fluency_judge
from services.fluency.metrics import compute_integrity_flags, compute_metrics, correlate_git
from services.fluency.prompts import RUBRIC
from services.fluency.transcript_parser import TranscriptParseError, parse_claude_code_jsonl

logger = logging.getLogger(__name__)


def _log_report_summary(submission_id: int, payload: dict) -> None:
    """
    Emit a readable, NON-SENSITIVE summary of the generated report to the logs
    so a run is observable in the terminal. Deliberately omits candidate quotes
    (evidence) and the narrative summary — those can contain transcript content
    and don't belong in log aggregators. Full report is on the API/DB.
    """
    try:
        dims = json.loads(payload.get("dimensions") or "[]")
        flags = json.loads(payload.get("integrity_flags") or "[]")
        lines = [
            f"Fluency {submission_id}: ANALYZED  overall={payload['overall_score']}  "
            f"provider={payload.get('provider')} "
            f"models={payload.get('chunk_model')}+{payload.get('aggregate_model')} "
            f"tokens~{payload.get('input_tokens_est')} "
            f"integrity={payload.get('integrity_confidence')}",
        ]
        for d in dims:
            score = d.get("score")
            lines.append(f"    {d.get('label', d.get('key')):<38} "
                         f"{('n/a' if score is None else score):>5}  ({d.get('confidence')})")
        if flags:
            lines.append("    flags: " + ", ".join(
                f"{f.get('code')}[{f.get('severity')}]" for f in flags))
        logger.info("\n".join(lines))
    except Exception:                              # logging must never break the pipeline
        logger.info("Fluency %s: analyzed (overall=%s)", submission_id,
                    payload.get("overall_score"))


def dispatch_fluency_analysis(submission_id: int) -> str:
    """Queue the analysis. Returns 'celery' or 'thread' (how it was dispatched)."""
    if settings.USE_CELERY:
        try:
            from services.tasks import run_fluency_analysis_task
            run_fluency_analysis_task.delay(submission_id)
            return "celery"
        except Exception as exc:                        # broker down → degrade, don't drop
            logger.error("Celery dispatch failed (%s); falling back to thread", exc)

    t = threading.Thread(target=execute_fluency_analysis, args=(submission_id,), daemon=True)
    t.start()
    return "thread"


def execute_fluency_analysis(submission_id: int) -> None:
    """Worker body — owns its DB session and event loop (same shape as the funnel)."""
    db = SessionLocal()
    try:
        # Compare-and-set claim: only one worker may move this submission into
        # processing. 'failed' is claimable too (recruiter retry).
        claimed = (
            db.query(models.AssignmentSubmission)
            .filter(
                models.AssignmentSubmission.id == submission_id,
                models.AssignmentSubmission.status.in_(["submitted", "failed"]),
            )
            .update(
                {
                    "status": "processing",
                    "error": None,
                    "attempts": models.AssignmentSubmission.attempts + 1,
                },
                synchronize_session=False,
            )
        )
        db.commit()
        if not claimed:
            logger.info("Fluency %s: not claimable (already processing/analyzed)", submission_id)
            return

        submission = db.get(models.AssignmentSubmission, submission_id)
        assignment = submission.assignment

        report_payload = asyncio.run(_analyze(submission, assignment))

        # Idempotent persist: replace any previous report for this submission.
        db.query(models.FluencyReport).filter(
            models.FluencyReport.submission_id == submission_id
        ).delete(synchronize_session=False)
        db.add(models.FluencyReport(submission_id=submission_id, **report_payload))

        submission = db.get(models.AssignmentSubmission, submission_id)
        submission.status = "analyzed"
        submission.analyzed_at = datetime.now(timezone.utc)
        db.commit()
        _log_report_summary(submission_id, report_payload)

    except Exception as exc:
        logger.exception("Fluency analysis failed for submission %s", submission_id)
        db.rollback()
        try:
            submission = db.get(models.AssignmentSubmission, submission_id)
            if submission:
                submission.status = "failed"
                submission.error = str(exc)[:2000]
                db.commit()
        except Exception:
            db.rollback()
    finally:
        db.close()


async def _analyze(submission: models.AssignmentSubmission,
                   assignment: models.Assignment) -> dict:
    """Pure analysis: load → parse → metrics → judge → report payload dict."""
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

    # git↔transcript correlation (only when the submit CLI provided git metadata)
    git = None
    if submission.git_metadata:
        try:
            git = json.loads(submission.git_metadata)
        except (ValueError, TypeError):
            git = None
    if git:
        metrics["git"] = git
        flags.extend(correlate_git(metrics, git))

    # Recompute confidence AFTER all flags (git ones can downgrade it).
    severe = sum(1 for f in flags if f["severity"] == "high")
    medium = sum(1 for f in flags if f["severity"] == "medium")
    integrity_confidence = "low" if severe else "medium" if medium else "high"

    sessions, budget_stats = enforce_budget(sessions)
    chunks = build_chunks(sessions)
    judge = get_fluency_judge()
    logger.info("Fluency %s: parsed %d sessions (%d prompts, %d tool calls) → %d chunks "
                "(~%s tokens), judging with %s",
                submission.id, len(sessions), metrics["prompts"], metrics["tool_calls"],
                len(chunks), budget_stats.get("final_tokens_est"), judge.chunk_model)

    chunk_results = await judge.score_chunks(chunks, assignment.brief, assignment.evaluation_focus)
    logger.info("Fluency %s: scored %d/%d chunks, aggregating with %s",
                submission.id, len(chunk_results), len(chunks), judge.aggregate_model)
    final = await judge.aggregate(chunk_results, metrics, flags,
                                  assignment.brief, assignment.evaluation_focus)

    dimensions = _normalize_dimensions(final.get("dimensions"))
    overall = _weighted_overall(dimensions)

    return {
        "overall_score": overall,
        "summary": final.get("summary") or "",
        "dimensions": json.dumps(dimensions, ensure_ascii=False),
        "highlights": json.dumps({
            **(final.get("highlights") or {}),
            "interview_questions": final.get("interview_questions") or [],
        }, ensure_ascii=False),
        "metrics": json.dumps({**metrics, "budget": budget_stats}, ensure_ascii=False),
        "integrity_flags": json.dumps(flags, ensure_ascii=False),
        "integrity_confidence": integrity_confidence,
        "provider": judge.provider,
        "chunk_model": judge.chunk_model,
        "aggregate_model": judge.aggregate_model,
        "input_tokens_est": budget_stats.get("final_tokens_est"),
    }


def _normalize_dimensions(raw) -> list[dict]:
    """Force the model's dimension list into rubric order with sane values."""
    by_key = {}
    if isinstance(raw, list):
        for d in raw:
            if isinstance(d, dict) and d.get("key"):
                by_key[d["key"]] = d

    out = []
    for spec in RUBRIC:
        d = by_key.get(spec["key"], {})
        score = d.get("score")
        if isinstance(score, (int, float)):
            score = max(0, min(100, round(float(score), 1)))
        else:
            score = None
        evidence = d.get("evidence")
        out.append({
            "key": spec["key"],
            "label": spec["label"],
            "weight": spec["weight"],
            "score": score,
            "confidence": d.get("confidence") if d.get("confidence") in ("high", "medium", "low") else "low",
            "note": str(d.get("note") or "")[:600],
            "evidence": [str(e)[:300] for e in evidence[:3]] if isinstance(evidence, list) else [],
        })
    return out


def _weighted_overall(dimensions: list[dict]) -> float:
    """
    Deterministic overall = weighted average of the OBSERVED dimensions, using the
    rubric weights (which sum to 100). Weights are renormalized over the dimensions
    that actually got a score, so a transcript that never exercised a low-weight
    dimension isn't penalized for it. Returns 0.0 if nothing was observable.
    """
    scored = [(d["score"], d.get("weight", 0)) for d in dimensions if d["score"] is not None]
    total_weight = sum(w for _, w in scored)
    if total_weight <= 0:
        return 0.0
    return round(sum(s * w for s, w in scored) / total_weight, 1)
