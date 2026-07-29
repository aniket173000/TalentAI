"""
Celery tasks for the ranking funnel.

The task body delegates to funnel.execute_ranking_run, so the funnel logic is
identical whether dispatched via Celery or the in-process thread fallback.
"""
import logging

from celery_app import celery_app
from services.funnel import execute_ranking_run

logger = logging.getLogger(__name__)


@celery_app.task(name="run_ranking_task")
def run_ranking_task(run_id: int, job_id: int, recruiter_id: int,
                     top_k: int, rerank_n: int, eval_n: int) -> None:
    logger.info("Celery run_ranking_task starting: run=%s job=%s", run_id, job_id)
    execute_ranking_run(run_id, job_id, recruiter_id, top_k, rerank_n, eval_n)


@celery_app.task(name="run_fluency_analysis_task", acks_late=True)
def run_fluency_analysis_task(submission_id: int) -> None:
    """
    AI-fluency transcript analysis for an assignment submission.
    acks_late + the pipeline's compare-and-set status claim make a worker
    crash safe: the task redelivers, and duplicates no-op on the claim.
    """
    from services.fluency.pipeline import execute_fluency_analysis
    logger.info("Celery run_fluency_analysis_task starting: submission=%s", submission_id)
    execute_fluency_analysis(submission_id)


@celery_app.task(name="run_pulse_analysis_task", acks_late=True)
def run_pulse_analysis_task(submission_id: int) -> None:
    """
    AI-fluency analysis for a Pulse team submission (general-work mode).
    acks_late + the pipeline's compare-and-set status claim make a worker
    crash safe: the task redelivers, and duplicates no-op on the claim.
    """
    from services.pulse.pipeline import execute_pulse_analysis
    logger.info("Celery run_pulse_analysis_task starting: submission=%s", submission_id)
    execute_pulse_analysis(submission_id)


@celery_app.task(name="pulse_period_rollover_task")
def pulse_period_rollover_task() -> None:
    """
    Scheduled (Celery beat) rollover: close every open Pulse period whose window
    has ended, building its team rollup + Playbook. Idempotent — build steps
    upsert and the closed status makes a re-run a no-op, so a missed/duplicate
    beat tick is harmless. Each org/period is isolated: one failure never blocks
    the rest.
    """
    from datetime import datetime, timezone

    import models
    from database import SessionLocal
    from services.pulse import aggregation, periods, playbook

    db = SessionLocal()
    closed = 0
    try:
        now = datetime.now(timezone.utc)
        due = (db.query(models.ReportingPeriod)
               .filter(models.ReportingPeriod.status == "open",
                       models.ReportingPeriod.ends_at <= now)
               .all())
        for period in due:
            org = db.get(models.Organization, period.org_id)
            if not org:
                continue
            try:
                aggregation.build_team_report(db, org, period)
                playbook.build_playbook(db, org, period)
                periods.close_period(db, period)
                closed += 1
            except Exception:
                logger.exception("Pulse rollover failed for org=%s period=%s",
                                 period.org_id, period.label)
                db.rollback()
        logger.info("Pulse rollover: closed %d/%d due periods", closed, len(due))
    finally:
        db.close()
