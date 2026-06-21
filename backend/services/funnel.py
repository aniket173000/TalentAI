"""
End-to-end candidate ranking funnel.

    corpus
      → retrieve_candidates   (pgvector ANN + hybrid)   -> top_k  (~500)
      → rerank_candidates      (cross-encoder)            -> rerank_n (~50)
      → evaluate_candidates    (LLM, top_n only)          -> eval_n  (~10)
      → compute_final_score    (blended 25/25/20/20/10)
      → persist_rankings       (candidate_rankings)

Only `eval_n` candidates ever reach the LLM — the whole point of the funnel.
"""
import asyncio
import json
import logging
import threading
from datetime import datetime, timezone

from sqlalchemy.orm import Session

import models
from database import SessionLocal
from services.evaluation import (
    compute_final_score,
    evaluate_candidates,
    persist_rankings,
)
from services.corpus_sync import sync_new_candidates
from services.reranker import rerank_candidates
from services.retrieval import retrieve_candidates

logger = logging.getLogger(__name__)


async def run_funnel(
    db: Session,
    job: models.Job,
    recruiter_id: int,
    top_k: int = 500,
    rerank_n: int = 50,
    eval_n: int = 10,
) -> dict:
    jd_req = {}
    if job.jd_requirements:
        try:
            jd_req = json.loads(job.jd_requirements)
        except Exception:
            jd_req = {}

    # Cheap incremental top-up (ingests only un-materialised candidates, capped
    # so a rank never triggers a mass extraction), then rank the whole base.
    sync = await sync_new_candidates(db)
    if sync["deferred"]:
        logger.warning("Funnel job=%s: %d candidates not materialised — run bulk_ingest.",
                       job.id, sync["deferred"])

    retrieved = await retrieve_candidates(db, job, recruiter_id=None, top_k=top_k)
    reranked = rerank_candidates(db, job, retrieved, top_n=rerank_n)
    evaluated = await evaluate_candidates(db, job, reranked, eval_n=eval_n)

    for cand in evaluated:
        compute_final_score(cand, jd_req)
    evaluated.sort(key=lambda c: c["final_score"], reverse=True)

    persist_rankings(db, job, recruiter_id, evaluated)

    logger.info(
        "Funnel job=%s: retrieved=%d reranked=%d evaluated=%d",
        job.id, len(retrieved), len(reranked), len(evaluated),
    )
    return {
        "retrieved": len(retrieved),
        "reranked": len(reranked),
        "evaluated": len(evaluated),
        "candidates": evaluated,
    }


def execute_ranking_run(run_id: int, job_id: int, recruiter_id: int,
                        top_k: int, rerank_n: int, eval_n: int) -> None:
    """
    The worker body — runs the funnel and updates the RankingRun. Called by both
    the in-process thread fallback and the Celery task, so the execution logic is
    identical regardless of dispatch mechanism. Opens its own DB session and a
    dedicated event loop (the sync reranker.predict blocks only this worker).
    """
    db = SessionLocal()
    try:
        run = db.get(models.RankingRun, run_id)
        run.status = "running"
        db.commit()

        job = db.get(models.Job, job_id)
        # Dedicated event loop in this thread (async OpenAI calls); the sync
        # reranker.predict blocks only this thread, not the request workers.
        result = asyncio.run(
            run_funnel(db, job, recruiter_id, top_k=top_k, rerank_n=rerank_n, eval_n=eval_n)
        )

        run = db.get(models.RankingRun, run_id)
        run.status = "done"
        run.retrieved = result["retrieved"]
        run.reranked = result["reranked"]
        run.evaluated = result["evaluated"]
        run.completed_at = datetime.now(timezone.utc)
        db.commit()
        logger.info("Ranking run %d done (job=%d)", run_id, job_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Ranking run %d failed: %s", run_id, exc)
        db.rollback()
        run = db.get(models.RankingRun, run_id)
        if run:
            run.status = "failed"
            run.error = str(exc)[:1000]
            run.completed_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


def start_ranking_run(db: Session, job_id: int, recruiter_id: int,
                      top_k: int = 500, rerank_n: int = 50, eval_n: int = 10) -> models.RankingRun:
    """
    Create a RankingRun row and dispatch the funnel.

    USE_CELERY → enqueue to the Celery worker (production: durable, scalable).
    Otherwise → run in an in-process daemon thread (dev/tests without a worker).
    If Celery dispatch fails (broker down), fall back to the thread so the run
    still completes rather than getting stuck in 'pending'.
    """
    from config import settings

    run = models.RankingRun(
        job_id=job_id, recruiter_id=recruiter_id, status="pending",
        top_k=top_k, rerank_n=rerank_n, eval_n=eval_n,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    args = (run.id, job_id, recruiter_id, top_k, rerank_n, eval_n)

    if settings.USE_CELERY:
        try:
            from services.tasks import run_ranking_task
            run_ranking_task.delay(*args)
            return run
        except Exception as exc:  # noqa: BLE001 — broker unreachable, etc.
            logger.error("Celery dispatch failed (%s); falling back to thread.", exc)

    threading.Thread(target=execute_ranking_run, args=args, daemon=True).start()
    return run
