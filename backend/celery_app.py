"""
Celery application for the ranking-funnel task queue.

Run a worker (from the backend/ directory):

    celery -A celery_app.celery_app worker --loglevel=info --pool=solo

Notes:
  * --pool=solo (or --pool=threads) is recommended on macOS to avoid fork-safety
    deadlocks with the default prefork pool. In Linux production, prefork with a
    tuned concurrency is fine. The rerank stage now calls the hosted Cohere API
    (no local torch), so the worker stays lightweight.
  * Broker + result backend are Redis (see docker-compose.yml).
  * Enable dispatch by setting USE_CELERY=true in the API process's env.
"""
import ssl

from celery import Celery
from celery.signals import worker_ready

from config import settings

celery_app = Celery(
    "talentai",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["services.tasks"],
)

# Managed Redis (Upstash/ElastiCache) speaks TLS via rediss://. Celery refuses a
# rediss URL unless ssl_cert_reqs is set, so configure it here rather than
# depending on the query param being present in every environment's URL.
if settings.CELERY_BROKER_URL.startswith("rediss://"):
    celery_app.conf.broker_use_ssl = {"ssl_cert_reqs": ssl.CERT_NONE}
if settings.CELERY_RESULT_BACKEND.startswith("rediss://"):
    celery_app.conf.redis_backend_use_ssl = {"ssl_cert_reqs": ssl.CERT_NONE}

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_time_limit=600,          # hard cap: a funnel run must finish in 10 min
    task_soft_time_limit=540,
    worker_max_tasks_per_child=20,  # recycle workers periodically to bound memory
)


@worker_ready.connect
def _warm_worker(**_kwargs):
    # Verify the reranker client is ready when the worker comes up (cheap; the
    # hosted API has no model to preload) so config problems surface early.
    from services.reranker import warm
    warm()
