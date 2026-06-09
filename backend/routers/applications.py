import json
import logging
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from services.ai_service import generate_rejection_email, screen_resume
from services.email_service import send_acceptance_notification, send_rejection_email
from services.file_parser import parse_resume

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/applications", tags=["applications"])


def _rerank(db: Session, job_id: int) -> None:
    """Assign contiguous ranks 1..N to all accepted applications, best score first."""
    accepted = (
        db.query(models.Application)
        .filter(
            models.Application.job_id == job_id,
            models.Application.status == "accepted",
        )
        .order_by(models.Application.match_score.desc())
        .all()
    )
    for i, app in enumerate(accepted):
        app.rank = i + 1
    db.commit()


@router.post("/apply/{job_id}")
async def apply_to_job(
    job_id: int,
    background_tasks: BackgroundTasks,
    candidate_name: str = Form(...),
    candidate_email: str = Form(...),
    resume_file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # ── 1. Fetch job ──────────────────────────────────────────────────────────
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    # ── 2. Parse resume ───────────────────────────────────────────────────────
    content = await resume_file.read()
    resume_text = parse_resume(content, resume_file.filename or "resume")
    if not resume_text or len(resume_text.strip()) < 50:
        raise HTTPException(
            status_code=400,
            detail="Could not extract text from resume. Please upload a valid PDF, DOCX, or TXT file.",
        )

    # ── 3. AI screening ───────────────────────────────────────────────────────
    try:
        screening = await screen_resume(job.jd_text, resume_text, job.title)
    except Exception as exc:
        logger.error(f"AI screening failed for job {job_id}: {exc}")
        raise HTTPException(status_code=500, detail="AI screening service unavailable. Please try again.")

    match_score = float(screening.get("match_score", 0))
    strengths: list = screening.get("strengths", [])
    gaps: list = screening.get("gaps", [])
    suggestions: list = screening.get("improvement_suggestions", [])
    summary: str = screening.get("summary", "")

    # Capture primitive values used in background tasks (avoids ORM session issues)
    job_title = job.title
    job_company = job.company
    max_count = job.max_count
    min_score = job.min_match_score

    def _save(status: str) -> models.Application:
        app = models.Application(
            job_id=job_id,
            candidate_name=candidate_name,
            candidate_email=candidate_email,
            resume_text=resume_text,
            resume_filename=resume_file.filename or "resume",
            match_score=match_score,
            status=status,
            rank=None,
            strengths=json.dumps(strengths),
            gaps=json.dumps(gaps),
            improvement_suggestions=json.dumps(suggestions),
        )
        db.add(app)
        db.commit()
        db.refresh(app)
        return app

    # ── 4. Below minimum threshold → instant rejection ────────────────────────
    if match_score < min_score:
        _save("rejected")

        async def _send_below_threshold():
            body = await generate_rejection_email(
                candidate_name, job_title, job_company,
                match_score, gaps, suggestions, "score_below_threshold",
            )
            await send_rejection_email(candidate_email, candidate_name, job_title, body)

        background_tasks.add_task(_send_below_threshold)

        return {
            "status": "rejected",
            "match_score": round(match_score, 1),
            "message": (
                f"Your resume matched {match_score:.1f}% with this role. "
                f"The minimum requirement is {min_score:.0f}%."
            ),
            "strengths": strengths,
            "gaps": gaps,
            "improvement_suggestions": suggestions,
            "summary": summary,
        }

    # ── 5. Get current accepted pool ──────────────────────────────────────────
    accepted = (
        db.query(models.Application)
        .filter(
            models.Application.job_id == job_id,
            models.Application.status == "accepted",
        )
        .order_by(models.Application.match_score.desc())
        .all()
    )

    # ── 6. Pool not full → add directly ──────────────────────────────────────
    if len(accepted) < max_count:
        app = _save("accepted")
        _rerank(db, job_id)
        db.refresh(app)

        background_tasks.add_task(
            send_acceptance_notification,
            candidate_email, candidate_name, job_title, app.rank or 1, match_score,
        )

        return {
            "status": "accepted",
            "match_score": round(match_score, 1),
            "rank": app.rank,
            "total_in_pool": len(accepted) + 1,
            "max_pool": max_count,
            "message": (
                f"Congratulations! Your application was accepted and ranked "
                f"#{app.rank} with a {match_score:.1f}% match."
            ),
            "strengths": strengths,
            "summary": summary,
        }

    # ── 7. Pool full → compare with lowest-ranked ─────────────────────────────
    lowest = accepted[-1]  # sorted desc, so last = lowest score

    if match_score <= lowest.match_score:
        _save("rejected")

        async def _send_pool_full():
            body = await generate_rejection_email(
                candidate_name, job_title, job_company,
                match_score, gaps, suggestions, "pool_full",
            )
            await send_rejection_email(candidate_email, candidate_name, job_title, body)

        background_tasks.add_task(_send_pool_full)

        return {
            "status": "rejected",
            "match_score": round(match_score, 1),
            "message": (
                f"The candidate pool is full. Your score ({match_score:.1f}%) "
                f"did not exceed the current minimum ({lowest.match_score:.1f}%)."
            ),
            "strengths": strengths,
            "gaps": gaps,
            "improvement_suggestions": suggestions,
            "summary": summary,
        }

    # ── 8. New candidate displaces the lowest ─────────────────────────────────
    d_email = lowest.candidate_email
    d_name = lowest.candidate_name
    d_score = lowest.match_score
    d_gaps = json.loads(lowest.gaps or "[]")
    d_suggestions = json.loads(lowest.improvement_suggestions or "[]")

    lowest.status = "displaced"
    lowest.rank = None
    # _save commits the displaced status change along with the new application
    app = _save("accepted")
    _rerank(db, job_id)
    db.refresh(app)

    async def _send_displaced():
        body = await generate_rejection_email(
            d_name, job_title, job_company,
            d_score, d_gaps, d_suggestions, "displaced",
        )
        await send_rejection_email(d_email, d_name, job_title, body)

    background_tasks.add_task(_send_displaced)
    background_tasks.add_task(
        send_acceptance_notification,
        candidate_email, candidate_name, job_title, app.rank or 1, match_score,
    )

    return {
        "status": "accepted",
        "match_score": round(match_score, 1),
        "rank": app.rank,
        "total_in_pool": max_count,
        "max_pool": max_count,
        "displaced": True,
        "message": (
            f"Congratulations! Your application ranked #{app.rank} with a "
            f"{match_score:.1f}% match, displacing the previous lowest-ranked candidate."
        ),
        "strengths": strengths,
        "summary": summary,
    }


@router.get("/job/{job_id}", response_model=List[schemas.ApplicationResponse])
def get_accepted_applications(job_id: int, db: Session = Depends(get_db)):
    """Ranked shortlist — accepted candidates only."""
    return (
        db.query(models.Application)
        .filter(
            models.Application.job_id == job_id,
            models.Application.status == "accepted",
        )
        .order_by(models.Application.rank)
        .all()
    )


@router.get("/job/{job_id}/all")
def get_all_applications(job_id: int, db: Session = Depends(get_db)):
    """All applications for a job including rejected/displaced — recruiter view."""
    apps = (
        db.query(models.Application)
        .filter(models.Application.job_id == job_id)
        .order_by(models.Application.applied_at.desc())
        .all()
    )
    return [
        {
            "id": a.id,
            "candidate_name": a.candidate_name,
            "candidate_email": a.candidate_email,
            "match_score": a.match_score,
            "rank": a.rank,
            "status": a.status,
            "strengths": json.loads(a.strengths or "[]"),
            "gaps": json.loads(a.gaps or "[]"),
            "improvement_suggestions": json.loads(a.improvement_suggestions or "[]"),
            "applied_at": a.applied_at.isoformat() if a.applied_at else None,
        }
        for a in apps
    ]
