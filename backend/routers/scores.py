"""
Composite Scoring API — E5-S6

POST /api/scores/compute
  Compute and persist the full composite score for a candidate-job pair.
  Idempotent: same inputs return cached result instantly.

GET  /api/scores/{application_id}/{job_id}
  Return the latest composite score record.

GET  /api/scores/{application_id}/{job_id}/history
  Return all score records (newest first) — immutable history.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from database import get_db
from routers.auth import get_current_user, require_recruiter
from services.composite import (
    SCORING_MODEL_VERSION,
    compute_and_store,
    load_history,
    load_latest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/scores", tags=["scores"])


# ── Request schemas ───────────────────────────────────────────────────────────

class ComputeScoreRequest(BaseModel):
    application_id: int
    job_id: int

    class Config:
        json_schema_extra = {"example": {"application_id": 1, "job_id": 2}}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/compute")
async def compute_composite_score(
    body: ComputeScoreRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_recruiter),
):
    """
    Compute and store the composite suitability score for a candidate-job pair.

    Composite = Skills(30) + Experience(30) + Education(20) + Projects(20) = 100.

    **Idempotent**: if the exact same resume + JD combination was already scored
    with the current model version, the existing record is returned immediately
    (`from_cache: true`) without re-running the scoring pipeline.

    **Immutable history**: each new scoring run (after a resume update or JD
    re-parse) creates a *new* record; the old one is never overwritten.

    Prerequisites:
    - CandidateProfile must exist for this application_id (run resume extraction first).
    - JD requirements must be parsed for this job_id (jd_parse_status = "done").
    """
    try:
        result = await compute_and_store(
            application_id=body.application_id,
            job_id=body.job_id,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error(
            "Composite scoring failed: app=%s job=%s error=%s",
            body.application_id, body.job_id, exc,
        )
        raise HTTPException(status_code=503, detail=f"Scoring pipeline error: {exc}")

    return result.to_dict()


@router.get("/{application_id}/{job_id}")
def get_latest_score(
    application_id: int,
    job_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Return the most recent composite score for a candidate-job pair.

    Returns 404 if no score has been computed yet.
    Use POST /compute to trigger scoring.
    """
    result = load_latest(application_id, job_id, db)
    if not result:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No score found for application {application_id} + job {job_id}. "
                "Trigger scoring via POST /api/scores/compute."
            ),
        )
    return result.to_dict()


@router.get("/{application_id}/{job_id}/history")
def get_score_history(
    application_id: int,
    job_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_recruiter),
):
    """
    Return all composite score records for a candidate-job pair, newest first.

    Each record is immutable — re-scoring always creates a new entry.
    This endpoint shows how the candidate's score changed over time
    (e.g. after resume updates or JD re-parses).
    """
    history = load_history(application_id, job_id, db)
    return {
        "application_id": application_id,
        "job_id": job_id,
        "current_model_version": SCORING_MODEL_VERSION,
        "record_count": len(history),
        "records": history,
    }
