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
