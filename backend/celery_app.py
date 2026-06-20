"""
Celery application for the ranking-funnel task queue.

Run a worker (from the backend/ directory):

    celery -A celery_app.celery_app worker --loglevel=info --pool=solo

Notes:
  * --pool=solo (or --pool=threads) is recommended on macOS / when the
    cross-encoder (torch) is loaded, to avoid fork-safety deadlocks with the
    default prefork pool. In Linux production, prefork with a tuned concurrency
    is fine, or run a dedicated queue for the CPU-heavy rerank stage.
  * Broker + result backend are Redis (see docker-compose.yml).
  * Enable dispatch by setting USE_CELERY=true in the API process's env.
"""
from celery import Celery

from config import settings

celery_app = Celery(
    "talentai",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["services.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_time_limit=600,          # hard cap: a funnel run must finish in 10 min
    task_soft_time_limit=540,
    worker_max_tasks_per_child=20,  # recycle workers to bound memory (torch)
)
