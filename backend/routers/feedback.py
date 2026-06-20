"""
Recruiter feedback loop — records actions on ranked candidates for the future
learning-to-rank model, and maintains the per-job shortlist.

  POST   /api/feedback                    Log an action (viewed/shortlisted/…).
  GET    /api/feedback/job/{job_id}        Action history for a job.
  GET    /api/feedback/shortlist/{job_id}  Current shortlist for a job.
  DELETE /api/feedback/shortlist           Remove a candidate from the shortlist.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from database import get_db
from routers.auth import require_recruiter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/feedback", tags=["feedback"])

ACTIONS = {"viewed", "ignored", "shortlisted", "contacted", "interviewed", "rejected", "hired"}


class FeedbackRequest(BaseModel):
    job_id: int
    candidate_id: int
    action: str
    notes: Optional[str] = None


def _own_job(job_id: int, recruiter: models.User, db: Session) -> models.Job:
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.recruiter_id is not None and job.recruiter_id != recruiter.id:
        raise HTTPException(status_code=403, detail="Not your job.")
    return job


def _own_candidate(candidate_id: int, recruiter: models.User, db: Session) -> models.Candidate:
    c = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    # Allow platform candidates (recruiter_id is None) and the recruiter's own
    # uploads; reject another recruiter's private uploads.
    if not c or (c.recruiter_id is not None and c.recruiter_id != recruiter.id):
        raise HTTPException(status_code=404, detail="Candidate not found.")
    return c


@router.post("", status_code=status.HTTP_201_CREATED, summary="Log a recruiter action")
def log_feedback(
    body: FeedbackRequest,
    recruiter: models.User = Depends(require_recruiter),
    db: Session = Depends(get_db),
):
    if body.action not in ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid action. Allowed: {', '.join(sorted(ACTIONS))}.",
        )
    _own_job(body.job_id, recruiter, db)
    _own_candidate(body.candidate_id, recruiter, db)

    # Snapshot the funnel ranking at action time (ML features/labels).
    ranking = (
        db.query(models.CandidateRanking)
        .filter(
            models.CandidateRanking.job_id == body.job_id,
            models.CandidateRanking.candidate_id == body.candidate_id,
        )
        .first()
    )

    event = models.RecruiterFeedback(
        job_id=body.job_id,
        candidate_id=body.candidate_id,
        recruiter_id=recruiter.id,
        action=body.action,
        notes=body.notes,
        snapshot_final_score=ranking.final_score if ranking else None,
        snapshot_rank=ranking.rank if ranking else None,
    )
    db.add(event)

    # Keep the shortlist set in sync with shortlist/un-shortlist signals.
    if body.action == "shortlisted":
        exists = (
            db.query(models.Shortlist)
            .filter(
                models.Shortlist.job_id == body.job_id,
                models.Shortlist.candidate_id == body.candidate_id,
            )
            .first()
        )
        if not exists:
            db.add(models.Shortlist(
                job_id=body.job_id, candidate_id=body.candidate_id,
                recruiter_id=recruiter.id,
            ))
    elif body.action in ("rejected", "ignored"):
        db.query(models.Shortlist).filter(
            models.Shortlist.job_id == body.job_id,
            models.Shortlist.candidate_id == body.candidate_id,
        ).delete(synchronize_session=False)

    db.commit()
    db.refresh(event)
    return {"id": event.id, "action": event.action, "created_at": event.created_at}


@router.get("/job/{job_id}", summary="Action history for a job")
def feedback_history(
    job_id: int,
    recruiter: models.User = Depends(require_recruiter),
    db: Session = Depends(get_db),
):
    _own_job(job_id, recruiter, db)
    rows = (
        db.query(models.RecruiterFeedback)
        .filter(models.RecruiterFeedback.job_id == job_id)
        .order_by(models.RecruiterFeedback.created_at.desc())
        .all()
    )
    return {"job_id": job_id, "count": len(rows), "events": [
        {
            "id": r.id, "candidate_id": r.candidate_id, "action": r.action,
            "notes": r.notes, "snapshot_final_score": r.snapshot_final_score,
            "snapshot_rank": r.snapshot_rank, "created_at": r.created_at,
        } for r in rows
    ]}


@router.get("/shortlist/{job_id}", summary="Current shortlist for a job")
def get_shortlist(
    job_id: int,
    recruiter: models.User = Depends(require_recruiter),
    db: Session = Depends(get_db),
):
    _own_job(job_id, recruiter, db)
    rows = (
        db.query(models.Shortlist)
        .filter(models.Shortlist.job_id == job_id)
        .order_by(models.Shortlist.created_at.desc())
        .all()
    )
    return {"job_id": job_id, "count": len(rows), "shortlist": [
        {
            "candidate_id": r.candidate_id,
            "full_name": r.candidate.full_name if r.candidate else None,
            "headline": r.candidate.headline if r.candidate else None,
            "created_at": r.created_at,
        } for r in rows
    ]}


@router.delete("/shortlist", status_code=status.HTTP_204_NO_CONTENT,
               summary="Remove a candidate from the shortlist")
def remove_shortlist(
    job_id: int = Query(...),
    candidate_id: int = Query(...),
    recruiter: models.User = Depends(require_recruiter),
    db: Session = Depends(get_db),
):
    _own_job(job_id, recruiter, db)
    db.query(models.Shortlist).filter(
        models.Shortlist.job_id == job_id,
        models.Shortlist.candidate_id == candidate_id,
    ).delete(synchronize_session=False)
    db.commit()
