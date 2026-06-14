import hashlib
import json
import logging
import secrets
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

import models
import schemas
from config import settings  # noqa: F401 — used in resume-url endpoint
from database import SessionLocal, get_db
from routers.auth import get_current_user, require_candidate, require_recruiter
from services.ai_service import (
    generate_rank_explanation,
    get_embedding,
    rank_tied_candidates,
    screen_resume,
)
from services.email_service import (
    send_acceptance_notification,
    send_displacement_email,
    send_rank_change_email,
    send_rejection_email,
    send_status_change_email,
)
from services.file_parser import parse_resume
from services.storage_service import check_file_exists, get_presigned_url, upload_resume_file
from services.vector_service import cosine_similarity, rank_applications_by_vector

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/applications", tags=["applications"])


def _score_tier(rank: int | None, total: int) -> str | None:
    if rank is None or total == 0:
        return None
    pct = (rank / total) * 100
    if pct <= 25:
        return "Top 25"
    if pct <= 50:
        return "Top 50"
    return "Top 100"


def _status_url(token: str) -> str:
    return f"{settings.FRONTEND_URL}/status/{token}"


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _rerank(db: Session, job_id: int) -> list[dict]:
    """Assign contiguous ranks 1..N to accepted applications.
    Equal scores are broken by AI resume comparison; fallback is applied_at.
    Returns a list of rank-change dicts for candidates whose rank shifted."""
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
        return []

    # Snapshot ranks before reordering (None = new entrant, skip from diff)
    old_ranks = {a.id: a.rank for a in accepted}

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

    # Compute rank changes for existing pool members (skip new entrants with old_rank=None)
    changes = []
    for app in ordered:
        old = old_ranks.get(app.id)
        if old is not None and old != app.rank:
            changes.append({
                "app_id": app.id,
                "candidate_email": app.candidate_email,
                "candidate_name": app.candidate_name,
                "old_rank": old,
                "new_rank": app.rank,
                "status_token": app.status_token,
            })
    return changes


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


async def _send_displacement_notification(
    displaced_app_id: int,
    job_id: int,
    d_email: str,
    d_name: str,
    d_score: float,
    d_token: str | None,
    job_title: str,
    job_company: str,
    recruiter_name: str,
    recruiter_email: str,
    recruiter_position: str,
) -> None:
    """Background task: generate rank-1 comparison then send displacement email."""
    from services.ai_service import generate_displacement_comparison

    comparison = None
    try:
        with SessionLocal() as session:
            rank1 = (
                session.query(models.Application)
                .filter(
                    models.Application.job_id == job_id,
                    models.Application.status == "accepted",
                    models.Application.rank == 1,
                )
                .first()
            )
            displaced = (
                session.query(models.Application)
                .filter(models.Application.id == displaced_app_id)
                .first()
            )
            job = session.query(models.Job).filter(models.Job.id == job_id).first()

            if rank1 and displaced and job:
                comparison = await generate_displacement_comparison(
                    rank1.resume_text, rank1.match_score,
                    displaced.resume_text, d_score,
                    job.jd_text, job_title,
                )
    except Exception as exc:
        logger.warning("Displacement comparison failed for app %d: %s", displaced_app_id, exc)

    status_url = _status_url(d_token) if d_token else None
    await send_displacement_email(
        d_email, d_name, job_title, job_company,
        d_score, status_url, comparison,
        recruiter_name, recruiter_email, recruiter_position,
    )


async def _run_gaming_analysis(
    new_app_id: int,
    prev_app_id: int,
    new_resume_text: str,
    prev_resume_text: str,
    job_id: int,
) -> None:
    """Background task: run resume gaming analysis for reapplications."""
    from services.gaming.analyzer import analyze_reapplication
    await analyze_reapplication(new_app_id, prev_app_id, job_id, new_resume_text, prev_resume_text)


async def _store_profile_embedding(user_id: int, resume_text: str) -> None:
    """Background task: compute and cache a candidate's profile embedding after a new resume upload."""
    try:
        emb = await get_embedding(resume_text)
        with SessionLocal() as session:
            user = session.query(models.User).filter(models.User.id == user_id).first()
            if user:
                user.profile_embedding = json.dumps(emb)
                session.commit()
    except Exception as exc:
        logger.warning(f"Profile embedding update failed for user {user_id}: {exc}")


async def _store_embeddings(app_id: int, resume_text: str, job_id: int) -> None:
    """
    Background task: compute resume + JD embeddings and persist them.
    Also refreshes the candidate's cached profile_embedding so magic-match is always current.
    """
    try:
        resume_emb = await get_embedding(resume_text)
        emb_json = json.dumps(resume_emb)
        with SessionLocal() as session:
            app = session.query(models.Application).filter(
                models.Application.id == app_id
            ).first()
            if app:
                app.resume_embedding = emb_json
                # Keep candidate's profile_embedding in sync with their latest resume
                if app.candidate_user_id:
                    user = session.query(models.User).filter(
                        models.User.id == app.candidate_user_id
                    ).first()
                    if user:
                        user.profile_embedding = emb_json

            # Cache JD embedding on the job (only computed once)
            job = session.query(models.Job).filter(models.Job.id == job_id).first()
            if job and not job.jd_embedding:
                jd_emb = await get_embedding(job.jd_text)
                job.jd_embedding = json.dumps(jd_emb)

            session.commit()
    except Exception as exc:
        logger.warning(f"Embedding computation skipped for application {app_id}: {exc}")


# ── Apply helpers ─────────────────────────────────────────────────────────────

def _resume_hash(text: str) -> str:
    return hashlib.md5(text.strip().encode()).hexdigest()


@router.get("/check/{job_id}")
def check_prior_application(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_candidate),
):
    """
    Returns whether the candidate has already applied to this job and whether their
    current profile resume is the same as the one used in their last application.
    """
    existing = (
        db.query(models.Application)
        .filter(
            models.Application.job_id == job_id,
            models.Application.candidate_user_id == current_user.id,
        )
        .order_by(models.Application.applied_at.desc())
        .first()
    )
    if not existing:
        return {
            "has_applied": False, "same_resume": False,
            "previous_match_score": None, "usable_vault_ids": [],
        }

    applied_hash = _resume_hash(existing.resume_text) if existing.resume_text else None

    same_resume = False
    if current_user.resume_text and applied_hash:
        same_resume = _resume_hash(current_user.resume_text) == applied_hash

    # Vault resumes that differ from the one already applied with
    usable_vault_ids: list[int] = []
    if applied_hash:
        vault = db.query(models.UserResume).filter(
            models.UserResume.user_id == current_user.id
        ).all()
        usable_vault_ids = [
            r.id for r in vault
            if _resume_hash(r.resume_text) != applied_hash
        ]

    return {
        "has_applied": True,
        "same_resume": same_resume,
        "previous_match_score": round(existing.match_score, 1),
        "previous_status": existing.status,
        "usable_vault_ids": usable_vault_ids,
    }


# ── Apply ─────────────────────────────────────────────────────────────────────

@router.post("/apply/{job_id}")
async def apply_to_job(
    job_id: int,
    background_tasks: BackgroundTasks,
    confirmed_reapply: bool = Query(False),
    candidate_name: Optional[str] = Form(None),
    candidate_email: Optional[str] = Form(None),
    resume_file: Optional[UploadFile] = File(None),
    resume_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_candidate),  # must be logged in as candidate
):
    # 1. Fetch job ─────────────────────────────────────────────────────────────
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    if job.status != "published":
        msg = {
            "draft": "This job posting is not yet open for applications.",
            "closed": "This position is currently closed.",
        }.get(job.status, "This job is not accepting applications.")
        raise HTTPException(status_code=403, detail=msg)

    if job.application_deadline:
        from datetime import timezone as _tz
        deadline = job.application_deadline
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=_tz.utc)
        if deadline < datetime.now(_tz.utc):
            raise HTTPException(status_code=403, detail="The application deadline for this position has passed.")

    # Resolve name / email — fall back to profile values
    resolved_name = (candidate_name or current_user.full_name or "").strip()
    resolved_email = (candidate_email or current_user.email or "").strip()

    # 2. Resolve resume ────────────────────────────────────────────────────────
    if resume_id is not None:
        # Use a specific vault resume chosen by the candidate
        vault_entry = db.query(models.UserResume).filter(
            models.UserResume.id == resume_id,
            models.UserResume.user_id == current_user.id,
        ).first()
        if not vault_entry:
            raise HTTPException(status_code=404, detail="Selected resume not found in your vault.")
        resume_text = vault_entry.resume_text
        resume_filename = vault_entry.filename
        confirmed_reapply = True  # vault selection is always an explicit choice
    elif resume_file and resume_file.filename:
        content = await resume_file.read()
        resume_text = parse_resume(content, resume_file.filename)
        resume_filename = resume_file.filename
        if not resume_text or len(resume_text.strip()) < 50:
            raise HTTPException(
                status_code=400,
                detail="Could not extract text from resume. Please upload a valid PDF, DOCX, or TXT file.",
            )
        # Persist to profile + vault if the candidate has no resume yet
        if not current_user.resume_text:
            current_user.resume_text = resume_text
            current_user.resume_filename = resume_filename
            current_user.career_profile = None
            current_user.profile_embedding = None
            new_vault = models.UserResume(
                user_id=current_user.id, filename=resume_filename,
                resume_text=resume_text, is_primary=True,
            )
            db.add(new_vault)
            db.commit()
            background_tasks.add_task(_store_profile_embedding, current_user.id, resume_text)
    else:
        # No file / vault ID — use the active profile resume
        if not current_user.resume_text:
            raise HTTPException(
                status_code=400,
                detail="No resume on file. Please upload a resume to your profile before applying.",
            )
        resume_text = current_user.resume_text
        resume_filename = current_user.resume_filename or "resume"

    # 2b. Upload original file to S3 (best-effort, non-blocking) ──────────────
    _raw_bytes_for_s3: bytes | None = None
    _s3_filename: str | None = None
    if resume_file and resume_file.filename and resume_id is None:
        # content was already read above; re-use it from the local variable
        _raw_bytes_for_s3 = content          # type: ignore[name-defined]
        _s3_filename = resume_file.filename
    # vault resumes: file was already uploaded when originally added to vault

    resume_file_key: str | None = None
    if _raw_bytes_for_s3 and _s3_filename:
        import asyncio
        loop = asyncio.get_event_loop()
        resume_file_key = await loop.run_in_executor(
            None, upload_resume_file, _raw_bytes_for_s3, _s3_filename, current_user.id
        )

    # 3. Duplicate-application guard ───────────────────────────────────────────
    prior = (
        db.query(models.Application)
        .filter(
            models.Application.job_id == job_id,
            models.Application.candidate_user_id == current_user.id,
        )
        .order_by(models.Application.applied_at.desc())
        .first()
    )
    if prior:
        same = prior.resume_text and _resume_hash(prior.resume_text) == _resume_hash(resume_text)
        if same:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "same_resume",
                    "message": (
                        "You have already applied to this job with the same resume. "
                        "Please update your resume with skills relevant to this role before reapplying."
                    ),
                    "previous_match_score": round(prior.match_score, 1),
                },
            )
        if not confirmed_reapply:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "reapply_confirmation_required",
                    "message": (
                        "You have already applied to this job. "
                        "Please confirm that your new resume better matches the job requirements."
                    ),
                    "previous_match_score": round(prior.match_score, 1),
                },
            )

    # 4. AI screening (eligibility criteria injected into JD context) ──────────
    effective_jd = job.jd_text
    if job.criteria:
        criteria_lines = []
        if job.criteria.min_years_experience:
            criteria_lines.append(f"- Minimum {job.criteria.min_years_experience} years of experience required.")
        skills = json.loads(job.criteria.required_skills or "[]")
        if skills:
            criteria_lines.append(f"- Required skills: {', '.join(skills)}.")
        if job.criteria.required_education and job.criteria.required_education != "None":
            criteria_lines.append(f"- Minimum education level: {job.criteria.required_education}.")
        if criteria_lines:
            effective_jd += (
                "\n\nMANDATORY ELIGIBILITY CRITERIA "
                "(candidates clearly not meeting these must score below 50):\n"
                + "\n".join(criteria_lines)
            )

    try:
        screening = await screen_resume(effective_jd, resume_text, job.title)
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
        candidate_status = "pool_accepted" if status == "accepted" else "rejected"
        app = models.Application(
            job_id=job_id,
            candidate_user_id=current_user.id,
            candidate_name=resolved_name,
            candidate_email=resolved_email,
            resume_text=resume_text,
            resume_filename=resume_filename,
            resume_file_key=resume_file_key,
            match_score=match_score,
            status=status,
            candidate_status=candidate_status,
            status_token=secrets.token_urlsafe(16),
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

    # 5. Below threshold → instant rejection ───────────────────────────────────
    if match_score < min_score:
        saved = _save("rejected")
        background_tasks.add_task(_store_embeddings, saved.id, resume_text, job_id)
        if prior:
            background_tasks.add_task(
                _run_gaming_analysis, saved.id, prior.id, resume_text, prior.resume_text, job_id
            )
        background_tasks.add_task(
            send_rejection_email,
            resolved_email, resolved_name, job_title, job_company,
            match_score, strengths, gaps,
            recruiter_name, recruiter_email, recruiter_position,
        )
        return {
            "status": "rejected",
            "candidate_status": "rejected",
            "status_token": saved.status_token,
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
        rank_changes = await _rerank(db, job_id)
        db.refresh(app)
        total_pool = len(accepted) + 1
        background_tasks.add_task(_store_embeddings, app.id, resume_text, job_id)
        if prior:
            background_tasks.add_task(
                _run_gaming_analysis, app.id, prior.id, resume_text, prior.resume_text, job_id
            )
        for change in rank_changes:
            background_tasks.add_task(
                send_rank_change_email,
                change["candidate_email"], change["candidate_name"],
                job_title, job_company,
                change["old_rank"], change["new_rank"],
                _status_url(change["status_token"]),
                recruiter_name, recruiter_email, recruiter_position,
            )
        background_tasks.add_task(
            _send_acceptance_with_explanation,
            app.id, job_id, resolved_email, resolved_name, job_title, match_score,
            recruiter_name, recruiter_email, recruiter_position, strengths, gaps,
        )
        return {
            "status": "accepted",
            "candidate_status": "pool_accepted",
            "status_token": app.status_token,
            "score_tier": _score_tier(app.rank, total_pool),
            "match_score": round(match_score, 1),
            "rank": app.rank,
            "total_in_pool": total_pool,
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
        if prior:
            background_tasks.add_task(
                _run_gaming_analysis, saved.id, prior.id, resume_text, prior.resume_text, job_id
            )
        background_tasks.add_task(
            send_rejection_email,
            resolved_email, resolved_name, job_title, job_company,
            match_score, strengths, gaps,
            recruiter_name, recruiter_email, recruiter_position,
        )
        return {
            "status": "rejected",
            "candidate_status": "rejected",
            "status_token": saved.status_token,
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
    d_token = lowest.status_token
    d_strengths = json.loads(lowest.strengths or "[]")
    d_gaps = json.loads(lowest.gaps or "[]")
    d_suggestions = json.loads(lowest.improvement_suggestions or "[]")

    lowest.status = "displaced"
    lowest.candidate_status = "rejected"   # ← assign status when displaced
    lowest.rank = None
    app = _save("accepted")
    rank_changes = await _rerank(db, job_id)
    db.refresh(app)
    background_tasks.add_task(_store_embeddings, app.id, resume_text, job_id)
    if prior:
        background_tasks.add_task(
            _run_gaming_analysis, app.id, prior.id, resume_text, prior.resume_text, job_id
        )
    for change in rank_changes:
        background_tasks.add_task(
            send_rank_change_email,
            change["candidate_email"], change["candidate_name"],
            job_title, job_company,
            change["old_rank"], change["new_rank"],
            _status_url(change["status_token"]),
            recruiter_name, recruiter_email, recruiter_position,
        )

    # Notify displaced candidate with comparison against rank-1
    background_tasks.add_task(
        _send_displacement_notification,
        lowest.id, job_id,
        d_email, d_name, d_score, d_token,
        job_title, job_company,
        recruiter_name, recruiter_email, recruiter_position,
    )

    background_tasks.add_task(
        _send_acceptance_with_explanation,
        app.id, job_id, resolved_email, resolved_name, job_title, match_score,
        recruiter_name, recruiter_email, recruiter_position, strengths, gaps,
    )

    return {
        "status": "accepted",
        "candidate_status": "pool_accepted",
        "status_token": app.status_token,
        "score_tier": _score_tier(app.rank, max_count),
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

    # Build a map of user_id → phone for candidates who have accounts
    user_ids = [a.candidate_user_id for a in apps if a.candidate_user_id]
    phone_map: dict[int, str | None] = {}
    if user_ids:
        users = db.query(models.User.id, models.User.phone).filter(models.User.id.in_(user_ids)).all()
        phone_map = {u.id: u.phone for u in users}

    return [
        {
            "id": a.id,
            "candidate_name": a.candidate_name,
            "candidate_email": a.candidate_email,
            "phone": phone_map.get(a.candidate_user_id) if a.candidate_user_id else None,
            "resume_text": a.resume_text,
            "resume_filename": a.resume_filename,
            "match_score": a.match_score,
            "rank": a.rank,
            "status": a.status,
            "candidate_status": a.candidate_status or "received",
            "status_token": a.status_token,
            "strengths": json.loads(a.strengths or "[]"),
            "gaps": json.loads(a.gaps or "[]"),
            "improvement_suggestions": json.loads(a.improvement_suggestions or "[]"),
            "project_scores": json.loads(a.project_scores or "[]"),
            "applied_at": a.applied_at.isoformat() if a.applied_at else None,
        }
        for a in apps
    ]


# ── Recruiter: original resume file URL ──────────────────────────────────

@router.get("/{app_id}/resume-url")
def get_resume_url(
    app_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_recruiter),
):
    """
    Return a short-lived pre-signed S3 URL for the candidate's original resume file.

    Response:
      available=True  → url, filename, content_type, expires_in
      available=False → original file was not stored (S3 not configured or legacy row)
    """
    app = db.query(models.Application).filter(models.Application.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    job = db.query(models.Job).filter(models.Job.id == app.job_id).first()
    if not job or job.recruiter_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")

    if not app.resume_file_key:
        return {"available": False}

    url = get_presigned_url(app.resume_file_key, app.resume_filename or "resume")
    if not url:
        return {"available": False}

    ext = (app.resume_filename or "").rsplit(".", 1)[-1].lower()
    content_type_map = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc": "application/msword",
        "txt": "text/plain",
    }
    return {
        "available": True,
        "url": url,
        "filename": app.resume_filename,
        "content_type": content_type_map.get(ext, "application/octet-stream"),
        "expires_in": settings.S3_PRESIGN_EXPIRY,
    }


# ── Recruiter: S3 diagnostics for a specific application ─────────────────────

@router.get("/{app_id}/s3-debug")
def s3_debug(
    app_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_recruiter),
):
    """
    Debug endpoint — returns S3 configuration and file existence check for an application.
    Remove or restrict this endpoint before going to production.
    """
    from services.storage_service import s3_enabled, check_file_exists
    from config import settings as _s

    app = db.query(models.Application).filter(models.Application.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    job = db.query(models.Job).filter(models.Job.id == app.job_id).first()
    if not job or job.recruiter_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")

    file_key = app.resume_file_key
    file_exists_in_s3 = check_file_exists(file_key) if file_key else False
    presigned_url = None
    if file_key and file_exists_in_s3:
        presigned_url = get_presigned_url(file_key, app.resume_filename or "resume")

    return {
        "s3_enabled": s3_enabled(),
        "configured_region": _s.AWS_REGION,
        "configured_bucket": _s.S3_BUCKET,
        "access_key_id_prefix": (_s.AWS_ACCESS_KEY_ID[:8] + "...") if _s.AWS_ACCESS_KEY_ID else None,
        "resume_file_key": file_key,
        "file_exists_in_s3": file_exists_in_s3,
        "presigned_url_generated": presigned_url is not None,
        "presigned_url_preview": (presigned_url[:120] + "...") if presigned_url else None,
    }


# ── Recruiter: gaming analysis ───────────────────────────────────────────────

@router.get("/{app_id}/gaming-analysis")
def get_gaming_analysis(
    app_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_recruiter),
):
    """
    Returns resume gaming analysis for a reapplication.
    Returns {"available": false} if the candidate is a first-time applicant or analysis is still running.
    """
    app = db.query(models.Application).filter(models.Application.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    job = db.query(models.Job).filter(models.Job.id == app.job_id).first()
    if not job or job.recruiter_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")

    analysis = (
        db.query(models.ResumeGamingAnalysis)
        .filter(models.ResumeGamingAnalysis.application_id == app_id)
        .first()
    )

    if not analysis:
        return {"available": False}

    return {
        "available": True,
        "risk_level": analysis.risk_level,
        "gaming_risk_score": analysis.gaming_risk_score,
        "added_skills": json.loads(analysis.added_skills or "[]"),
        "skills_overlap_gaps": json.loads(analysis.skills_overlap_gaps or "[]"),
        "gap_exploit_ratio": analysis.gap_exploit_ratio,
        "unsupported_skills": json.loads(analysis.unsupported_skills or "[]"),
        "skill_evidence": json.loads(analysis.skill_evidence or "{}"),
        "resume_jd_similarity": analysis.resume_jd_similarity,
        "prev_resume_jd_similarity": analysis.prev_resume_jd_similarity,
        "similarity_delta": analysis.similarity_delta,
        "resume_self_similarity": analysis.resume_self_similarity,
        "analyzed_at": analysis.analyzed_at.isoformat() if analysis.analyzed_at else None,
    }


# ── Public: candidate status by token ────────────────────────────────────────

@router.get("/status/{token}", response_model=schemas.ApplicationStatusPublic)
def get_application_status(token: str, db: Session = Depends(get_db)):
    """Public endpoint — no login required. Returns candidate-facing status and score tier."""
    app = db.query(models.Application).filter(
        models.Application.status_token == token
    ).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    job = db.query(models.Job).filter(models.Job.id == app.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    total_in_pool = db.query(models.Application).filter(
        models.Application.job_id == app.job_id,
        models.Application.status == "accepted",
    ).count()

    # Show score tier for any candidate still in the accepted pool
    tier = _score_tier(app.rank, total_in_pool) if app.status == "accepted" else None

    return schemas.ApplicationStatusPublic(
        candidate_status=app.candidate_status,
        job_title=job.title,
        company=job.company,
        applied_at=app.applied_at,
        score_tier=tier,
        status_feedback=app.status_feedback,
    )


# ── Recruiter: update candidate status ───────────────────────────────────────

@router.patch("/{app_id}/status")
async def update_candidate_status(
    app_id: int,
    body: schemas.ApplicationStatusUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_recruiter),
):
    """Recruiter endpoint — change candidate_status and send notification email."""
    app = db.query(models.Application).filter(models.Application.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    job = db.query(models.Job).filter(models.Job.id == app.job_id).first()
    if not job or job.recruiter_id != current_user.id:
        raise HTTPException(status_code=403, detail="You don't own this job posting.")

    old_status = app.candidate_status
    app.candidate_status = body.candidate_status
    if body.feedback is not None:
        app.status_feedback = body.feedback
    db.commit()

    if old_status != body.candidate_status and app.status_token:
        background_tasks.add_task(
            send_status_change_email,
            app.candidate_email,
            app.candidate_name,
            job.title,
            job.company,
            body.candidate_status,
            _status_url(app.status_token),
            current_user.full_name,
            current_user.email,
            "Recruiter",
            body.feedback or "",
        )

    return {"id": app.id, "candidate_status": app.candidate_status}


# ── Magic Match — daily AI-powered job recommendations ────────────────────────

async def _compute_jd_embedding(job_id: int, jd_text: str) -> None:
    """Background task: embed a job's JD and cache it so future magic-match calls can rank it."""
    try:
        emb = await get_embedding(jd_text)
        with SessionLocal() as session:
            job = session.query(models.Job).filter(models.Job.id == job_id).first()
            if job and not job.jd_embedding:
                job.jd_embedding = json.dumps(emb)
                session.commit()
    except Exception as exc:
        logger.warning(f"Magic-match JD embedding failed for job {job_id}: {exc}")


@router.get("/magic-match")
async def magic_match_jobs(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_candidate),
):
    """
    Return up to 5 published jobs semantically matched to the candidate's resume.

    Rate-limited to 1 call per calendar day. Embedding is cached on the user row
    so repeated calls within the same day skip re-computation.
    """
    today_str = date.today().isoformat()
    reset_str = (date.today() + timedelta(days=1)).isoformat()

    # ── 1. Rate-limit check — return cached results for repeat calls today ────
    if current_user.magic_match_date == today_str:
        if current_user.magic_match_cache:
            try:
                cached = json.loads(current_user.magic_match_cache)
                cached["resets_at"] = reset_str
                cached["from_cache"] = True
                return cached
            except Exception:
                pass
        return {
            "matches": [],
            "total": 0,
            "resets_at": reset_str,
            "from_cache": True,
            "message": "No matches were found in today's session.",
        }

    # ── 2. Resolve candidate embedding ───────────────────────────────────────
    # Priority: cached profile_embedding → latest app resume_embedding → compute fresh
    candidate_emb: list[float] | None = None

    if current_user.profile_embedding:
        try:
            candidate_emb = json.loads(current_user.profile_embedding)
        except Exception:
            candidate_emb = None

    if candidate_emb is None:
        # Try the most recent application that already has an embedding
        recent_with_emb = (
            db.query(models.Application)
            .filter(
                models.Application.candidate_user_id == current_user.id,
                models.Application.resume_embedding.isnot(None),
            )
            .order_by(models.Application.applied_at.desc())
            .first()
        )
        if recent_with_emb:
            candidate_emb = json.loads(recent_with_emb.resume_embedding)
            # Warm the cache so tomorrow's call is instant
            current_user.profile_embedding = recent_with_emb.resume_embedding
            db.commit()

    if candidate_emb is None:
        # No pre-computed embedding — find the most recent resume text and embed it now
        latest_app = (
            db.query(models.Application)
            .filter(models.Application.candidate_user_id == current_user.id)
            .order_by(models.Application.applied_at.desc())
            .first()
        )
        if not latest_app:
            raise HTTPException(
                status_code=400,
                detail="No resume on file. Apply to at least one job first to activate Magic Match.",
            )
        try:
            candidate_emb = await get_embedding(latest_app.resume_text)
            current_user.profile_embedding = json.dumps(candidate_emb)
            db.commit()
        except Exception as exc:
            logger.error(f"Magic-match: failed to embed candidate {current_user.id}: {exc}")
            raise HTTPException(
                status_code=503,
                detail="Could not build your profile embedding right now. Try again in a moment.",
            )

    # ── 3. Jobs the candidate has already applied to ──────────────────────────
    applied_ids: set[int] = {
        r[0]
        for r in db.query(models.Application.job_id)
        .filter(models.Application.candidate_user_id == current_user.id)
        .all()
    }

    # ── 4. Candidate-eligible published jobs ──────────────────────────────────
    base_q = db.query(models.Job).filter(models.Job.status == "published")
    if applied_ids:
        base_q = base_q.filter(~models.Job.id.in_(applied_ids))

    all_unapplied = base_q.all()

    if not all_unapplied:
        current_user.magic_match_date = today_str
        db.commit()
        return {"matches": [], "total": 0, "resets_at": reset_str,
                "message": "No new jobs available right now — check back later!"}

    # Split into embedded (can rank) vs unembedded (queue for background indexing)
    embedded_jobs = [j for j in all_unapplied if j.jd_embedding]
    unembedded_jobs = [j for j in all_unapplied if not j.jd_embedding]

    # Enqueue JD embedding for up to 20 unembedded jobs so future calls rank them
    for j in unembedded_jobs[:20]:
        background_tasks.add_task(_compute_jd_embedding, j.id, j.jd_text)

    # ── 5. Rank embedded jobs by cosine similarity ────────────────────────────
    scored: list[tuple[float, models.Job]] = []
    for job in embedded_jobs:
        try:
            sim = cosine_similarity(candidate_emb, json.loads(job.jd_embedding))
            scored.append((sim, job))
        except Exception:
            pass

    scored.sort(key=lambda x: x[0], reverse=True)
    top5 = [item for item in scored if item[0] * 100 >= 70][:5]

    # ── 6. Mark daily usage and cache results ────────────────────────────────
    result = {
        "matches": [
            {
                "job_id": job.id,
                "title": job.title,
                "company": job.company,
                "location": job.location,
                "slug": job.slug,
                "department": job.department,
                "employment_type": job.employment_type,
                "remote_policy": job.remote_policy,
                "salary_range_min": job.salary_range_min,
                "salary_range_max": job.salary_range_max,
                "company_logo_url": job.company_logo_url,
                "min_match_score": job.min_match_score,
                "similarity_score": round(sim * 100, 1),
            }
            for sim, job in top5
        ],
        "total": len(top5),
    }
    current_user.magic_match_date = today_str
    current_user.magic_match_cache = json.dumps(result)
    db.commit()

    result["resets_at"] = reset_str
    return result


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
