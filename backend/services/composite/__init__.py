"""
services.composite — Composite Score Calculation & Storage (E5-S6)

Public API:

    from services.composite import compute_and_store, load_latest, load_history

    # Compute (idempotent — returns cached record if inputs unchanged)
    result = await compute_and_store(application_id=1, job_id=2, db=db)
    print(result.composite_score)   # 0–100
    print(result.to_dict())         # full serialisable breakdown

    # Read latest stored score
    result = load_latest(application_id=1, job_id=2, db=db)

    # Read all historical records
    history = load_history(application_id=1, job_id=2, db=db)

Composite = Skills(30) + Experience(30) + Education(20) + Projects(20) = 100.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Optional

from sqlalchemy.orm import Session

from services.composite.hasher import InputHasher
from services.composite.models import SCORING_MODEL_VERSION, CompositeScoreResult
from services.composite.scorer import CompositeScorer


# ── Singletons ────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _hasher() -> InputHasher:
    return InputHasher()


@lru_cache(maxsize=1)
def _scorer() -> CompositeScorer:
    return CompositeScorer(hasher=_hasher())


# ── High-level entry points ───────────────────────────────────────────────────

async def compute_and_store(
    application_id: int,
    job_id: int,
    db: Session,
) -> CompositeScoreResult:
    """
    Compute and persist the composite score for a candidate-job pair.

    Idempotent: if the same inputs_hash already exists in the DB, the existing
    record is returned immediately (result.from_cache = True).

    Otherwise all four sub-scorers run concurrently, the result is stored as a
    new row, and the old row is retained (immutable history per PRD spec).
    """
    return await _scorer().compute_and_store(
        application_id=application_id,
        job_id=job_id,
        db=db,
    )


def load_latest(
    application_id: int,
    job_id: int,
    db: Session,
) -> Optional[CompositeScoreResult]:
    """Return the most recent composite score record, or None."""
    return _scorer().load_latest(application_id, job_id, db)


def load_history(
    application_id: int,
    job_id: int,
    db: Session,
) -> list[dict]:
    """Return all score records for this pair, newest first."""
    return _scorer().load_history(application_id, job_id, db)


# ── Re-exports ────────────────────────────────────────────────────────────────

__all__ = [
    "compute_and_store",
    "load_latest",
    "load_history",
    "CompositeScoreResult",
    "SCORING_MODEL_VERSION",
]
