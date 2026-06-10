import json
import logging
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

import models
import schemas
from database import SessionLocal, get_db
from routers.auth import get_current_user, require_candidate, require_recruiter
from services.ai_service import (
    generate_rank_explanation,
    generate_rejection_email,
    get_embedding,
    rank_tied_candidates,
    screen_resume,
)
from services.email_service import send_acceptance_notification, send_rejection_email
from services.file_parser import parse_resume
from services.vector_service import rank_applications_by_vector

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/applications", tags=["applications"])


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _rerank(db: Session, job_id: int) -> None:
    """Assign contiguous ranks 1..N to accepted applications.
    Equal scores are broken by AI resume comparison; fallback is applied_at."""
    accepted = (
        db.query(models.Application)
        .filter(
            models.Application.job_id == job_id,
            models.Application.status == "accepted",
        )
        .order_by(
            models.Application.match_score.desc(),
            models.Application.applied_at.asc(),
        )
        .all()
    )

    if not accepted:
        return

    # Group consecutive entries by rounded score to find ties
    ordered: list = []
    i = 0
    while i < len(accepted):
        group = [accepted[i]]
        while (
            i + 1 < len(accepted)
            and round(accepted[i + 1].match_score, 1) == round(accepted[i].match_score, 1)
        ):
            i += 1
            group.append(accepted[i])

        if len(group) > 1:
            try:
                job = db.query(models.Job).filter(models.Job.id == job_id).first()
                if job:
                    candidates = [(a.id, a.candidate_name, a.resume_text) for a in group]
                    ranked_ids = await rank_tied_candidates(job.jd_text, job.title, candidates)
                    id_map = {a.id: a for a in group}
                    reordered = [id_map[rid] for rid in ranked_ids if rid in id_map]
                    # Safety: append any not returned by AI
                    returned = set(ranked_ids)
                    reordered += [a for a in group if a.id not in returned]
                    group = reordered
            except Exception as exc:
                logger.warning(f"AI tiebreaker failed for job {job_id}: {exc}")
                # Falls back to applied_at order already set by the query

        ordered.extend(group)
        i += 1

    for pos, app in enumerate(ordered):
        app.rank = pos + 1
    db.commit()


async def _send_acceptance_with_explanation(
    app_id: int,
    job_id: int,
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    match_score: float,
    recruiter_name: str,
    recruiter_email: str,
    recruiter_position: str,
    strengths: list,
    gaps: list,
) -> None:
    """Background task: generate rank explanation then send acceptance email."""
    with SessionLocal() as session:
        app = session.query(models.Application).filter(
            models.Application.id == app_id
        ).first()
        if not app or not app.rank:
            return

        job = session.query(models.Job).filter(models.Job.id == job_id).first()
        total = session.query(models.Application).filter(
            models.Application.job_id == job_id,
            models.Application.status == "accepted",
        ).count()

        above = session.query(models.Application).filter(
            models.Application.job_id == job_id,
            models.Application.status == "accepted",
            models.Application.rank < app.rank,
        ).order_by(models.Application.rank).all()

        rank_explanation = ""
        if above and job:
            try:
                above_data = [
                    {
                        "rank": a.rank,
                        "score": a.match_score,
                        "strengths": json.loads(a.strengths or "[]"),
                        "resume": a.resume_text,
                    }
                    for a in above
                ]
                rank_explanation = await generate_rank_explanation(
                    candidate_name, job_title, app.rank, total,
                    app.resume_text, above_data, job.jd_text,
                )
            except Exception as exc:
                logger.warning(f"Rank explanation failed for app {app_id}: {exc}")

        await send_acceptance_notification(
            candidate_email, candidate_name, job_title, app.rank, match_score,
            recruiter_name, recruiter_email, recruiter_position,
            strengths, gaps, rank_explanation,
        )


async def _store_embeddings(app_id: int, resume_text: str, job_id: int) -> None:
    """
    Background task: compute resume + JD embeddings and persist them.
    Uses its own DB session (safe for background execution).
    """
    try:
        resume_emb = await get_embedding(resume_text)
        with SessionLocal() as session:
            app = session.query(models.Application).filter(
                models.Application.id == app_id
            ).first()
            if app:
                app.resume_embedding = json.dumps(resume_emb)

            # Cache JD embedding on the job (only computed once)
            job = session.query(models.Job).filter(models.Job.id == job_id).first()
            if job and not job.jd_embedding:
                jd_emb = await get_embedding(job.jd_text)
                job.jd_embedding = json.dumps(jd_emb)

            session.commit()
    except Exception as exc:
        logger.warning(f"Embedding computation skipped for application {app_id}: {exc}")


# ── Apply ─────────────────────────────────────────────────────────────────────

@router.post("/apply/{job_id}")
async def apply_to_job(
    job_id: int,
    background_tasks: BackgroundTasks,
    candidate_name: str = Form(...),
    candidate_email: str = Form(...),
    resume_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_candidate),  # must be logged in as candidate
):
    # 1. Fetch job ─────────────────────────────────────────────────────────────
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    # 2. Parse resume ──────────────────────────────────────────────────────────
    content = await resume_file.read()
    resume_text = parse_resume(content, resume_file.filename or "resume")
    if not resume_text or len(resume_text.strip()) < 50:
        raise HTTPException(
            status_code=400,
            detail="Could not extract text from resume. Please upload a valid PDF, DOCX, or TXT file.",
        )

    # 3. AI screening ──────────────────────────────────────────────────────────
    try:
        screening = await screen_resume(job.jd_text, resume_text, job.title)
    except Exception as exc:
        logger.error(f"AI screening failed for job {job_id}: {exc}")
        raise HTTPException(status_code=500, detail="AI screening service unavailable. Please try again.")

    match_score = float(screening.get("match_score", 0))
    strengths: list = screening.get("strengths", [])
    gaps: list = screening.get("gaps", [])
    suggestions: list = screening.get("improvement_suggestions", [])
    project_scores: list = screening.get("project_scores", [])
    summary: str = screening.get("summary", "")

    job_title = job.title
    job_company = job.company
    max_count = job.max_count
    min_score = job.min_match_score

    _rec = job.recruiter
    recruiter_name = _rec.full_name if _rec else "Recruitment Team"
    recruiter_email = _rec.email if _rec else ""
    recruiter_position = _rec.role.capitalize() if _rec else "Recruiter"

    def _save(status: str) -> models.Application:
        app = models.Application(
            job_id=job_id,
            candidate_user_id=current_user.id,
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
            project_scores=json.dumps(project_scores),
        )
        db.add(app)
        db.commit()
        db.refresh(app)
        return app

    # 4. Below threshold → instant rejection ───────────────────────────────────
    if match_score < min_score:
        saved = _save("rejected")
        background_tasks.add_task(_store_embeddings, saved.id, resume_text, job_id)

        async def _send_below():
            body = await generate_rejection_email(
                candidate_name, job_title, job_company,
                match_score, gaps, suggestions, "score_below_threshold",
                recruiter_name, recruiter_email, recruiter_position,
            )
            await send_rejection_email(candidate_email, candidate_name, job_title, body, strengths, gaps)

        background_tasks.add_task(_send_below)

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
            "project_scores": project_scores,
            "summary": summary,
        }

    # 5. Current accepted pool ─────────────────────────────────────────────────
    accepted = (
        db.query(models.Application)
        .filter(
            models.Application.job_id == job_id,
            models.Application.status == "accepted",
        )
        .order_by(models.Application.match_score.desc())
        .all()
    )

    # 6. Pool not full → add directly ──────────────────────────────────────────
    if len(accepted) < max_count:
        app = _save("accepted")
        await _rerank(db, job_id)
        db.refresh(app)
        background_tasks.add_task(_store_embeddings, app.id, resume_text, job_id)
        background_tasks.add_task(
            _send_acceptance_with_explanation,
            app.id, job_id, candidate_email, candidate_name, job_title, match_score,
            recruiter_name, recruiter_email, recruiter_position, strengths, gaps,
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
            "project_scores": project_scores,
            "summary": summary,
        }

    # 7. Pool full → compare with lowest ──────────────────────────────────────
    lowest = accepted[-1]

    if match_score <= lowest.match_score:
        saved = _save("rejected")
        background_tasks.add_task(_store_embeddings, saved.id, resume_text, job_id)

        async def _send_full():
            body = await generate_rejection_email(
                candidate_name, job_title, job_company,
                match_score, gaps, suggestions, "pool_full",
                recruiter_name, recruiter_email, recruiter_position,
            )
            await send_rejection_email(candidate_email, candidate_name, job_title, body, strengths, gaps)

        background_tasks.add_task(_send_full)
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
            "project_scores": project_scores,
            "summary": summary,
        }

    # 8. Displace lowest ───────────────────────────────────────────────────────
    d_email = lowest.candidate_email
    d_name = lowest.candidate_name
    d_score = lowest.match_score
    d_strengths = json.loads(lowest.strengths or "[]")
    d_gaps = json.loads(lowest.gaps or "[]")
    d_suggestions = json.loads(lowest.improvement_suggestions or "[]")

    lowest.status = "displaced"
    lowest.rank = None
    app = _save("accepted")
    await _rerank(db, job_id)
    db.refresh(app)
    background_tasks.add_task(_store_embeddings, app.id, resume_text, job_id)

    async def _send_displaced():
        body = await generate_rejection_email(
            d_name, job_title, job_company,
            d_score, d_gaps, d_suggestions, "displaced",
            recruiter_name, recruiter_email, recruiter_position,
        )
        await send_rejection_email(d_email, d_name, job_title, body, d_strengths, d_gaps)

    background_tasks.add_task(_send_displaced)
    background_tasks.add_task(
        _send_acceptance_with_explanation,
        app.id, job_id, candidate_email, candidate_name, job_title, match_score,
        recruiter_name, recruiter_email, recruiter_position, strengths, gaps,
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
        "project_scores": project_scores,
        "summary": summary,
    }


# ── Candidate: my applications ────────────────────────────────────────────────

@router.get("/my", response_model=List[schemas.ApplicationResponse])
def my_applications(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_candidate),
):
    """Returns all applications submitted by the authenticated candidate."""
    return (
        db.query(models.Application)
        .filter(models.Application.candidate_user_id == current_user.id)
        .order_by(models.Application.applied_at.desc())
        .all()
    )


# ── Public: ranked shortlist ──────────────────────────────────────────────────

@router.get("/job/{job_id}", response_model=List[schemas.ApplicationResponse])
def get_accepted_applications(job_id: int, db: Session = Depends(get_db)):
    """Ranked shortlist — accepted candidates only (public)."""
    return (
        db.query(models.Application)
        .filter(
            models.Application.job_id == job_id,
            models.Application.status == "accepted",
        )
        .order_by(models.Application.rank)
        .all()
    )


# ── Recruiter: all applications ───────────────────────────────────────────────

@router.get("/job/{job_id}/all")
def get_all_applications(
    job_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_recruiter),  # recruiter-only
):
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
            "project_scores": json.loads(a.project_scores or "[]"),
            "applied_at": a.applied_at.isoformat() if a.applied_at else None,
        }
        for a in apps
    ]


# ── Recruiter: vector similarity re-ranking ───────────────────────────────────

@router.get("/job/{job_id}/vector-rank")
def get_vector_ranked(
    job_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_recruiter),
):
    """
    Re-rank accepted candidates by cosine similarity to the JD embedding.
    Falls back to match_score for candidates whose embeddings haven't been computed yet.
    """
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if not job.jd_embedding:
        raise HTTPException(
            status_code=202,
            detail="JD embedding not yet computed. Try again in a few seconds after the first application is submitted.",
        )

    accepted = (
        db.query(models.Application)
        .filter(
            models.Application.job_id == job_id,
            models.Application.status == "accepted",
        )
        .all()
    )

    import json as _json
    jd_emb = _json.loads(job.jd_embedding)
    ranked = rank_applications_by_vector(accepted, jd_emb)

    return [
        {
            "id": a.id,
            "candidate_name": a.candidate_name,
            "candidate_email": a.candidate_email,
            "match_score": a.match_score,
            "rank": a.rank,
            "status": a.status,
            "project_scores": json.loads(a.project_scores or "[]"),
            "has_embedding": bool(a.resume_embedding),
        }
        for a in ranked
    ]
