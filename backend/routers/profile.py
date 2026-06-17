import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
import schemas
from database import SessionLocal, get_db
from routers.auth import get_current_user
from config import settings
from services.ai_service import generate_career_profile, get_embedding
from services.file_parser import parse_resume
from services.storage_service import get_presigned_url, upload_resume_file

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/profile", tags=["profile"])

MAX_VAULT_SIZE = 3


# ── Schemas ───────────────────────────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None


class RecruiterProfileUpdate(BaseModel):
    company: Optional[str] = None
    is_third_party: Optional[bool] = None


class CollegeUpdateBody(BaseModel):
    college_name: str
    graduation_year: Optional[int] = None
    is_graduated: bool = False
    degree_type: Optional[str] = None
    field_of_study: Optional[str] = None
    college_url: Optional[str] = None
    candidate_linkedin_url: Optional[str] = None
    current_company: Optional[str] = None


# ── Response helper ───────────────────────────────────────────────────────────

def _profile_response(user: models.User) -> dict:
    c = user.candidate_ext
    r = user.recruiter_ext
    ed = user.primary_education

    career = None
    if c and c.career_profile:
        try:
            career = json.loads(c.career_profile)
        except Exception:
            pass

    vault = [
        {
            "id": rv.id,
            "filename": rv.filename,
            "is_primary": rv.is_primary,
            "uploaded_at": rv.uploaded_at.isoformat() if rv.uploaded_at else None,
        }
        for rv in (user.resumes or [])
    ]

    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "phone": user.phone,
        "is_candidate": user.is_candidate,
        "is_recruiter": user.is_recruiter,
        "linkedin_verified": bool(user.linkedin_verified),
        "created_at": user.created_at.isoformat() if user.created_at else None,

        # Candidate fields
        "onboarding_completed": bool(c.onboarding_completed) if c else False,
        "candidate_linkedin_url": c.candidate_linkedin_url if c else None,
        "current_company": c.current_company if c else None,
        "resume_filename": c.resume_filename if c else None,
        "career_profile": career,
        "career_profile_updated_at": (
            c.career_profile_updated_at.isoformat()
            if c and c.career_profile_updated_at else None
        ),
        "resumes": vault,

        # Education
        "college_name": ed.institution_name if ed else None,
        "graduation_year": ed.graduation_year if ed else None,
        "is_graduated": ed.is_graduated if ed else None,
        "college_logo_url": (ed.college.logo_url if ed and ed.college else None),
        "education_records": [
            {
                "id": e.id,
                "institution_name": e.institution_name,
                "degree_type": e.degree_type,
                "field_of_study": e.field_of_study,
                "graduation_year": e.graduation_year,
                "is_graduated": e.is_graduated,
                "is_primary": e.is_primary,
            }
            for e in (user.education_records or [])
        ],

        # Recruiter fields
        "company": r.company if r else None,
        "is_third_party_recruiter": bool(r.is_third_party) if r else False,
    }


# ── Background tasks ──────────────────────────────────────────────────────────

async def _refresh_career(user_id: int, resume_text: str) -> None:
    try:
        profile = await generate_career_profile(resume_text)
        with SessionLocal() as session:
            ext = session.query(models.CandidateExtension).filter(
                models.CandidateExtension.user_id == user_id
            ).first()
            if ext:
                ext.career_profile = json.dumps(profile)
                ext.career_profile_updated_at = datetime.utcnow()
                session.commit()
    except Exception as exc:
        logger.error(f"Career profile generation failed for user {user_id}: {exc}")


async def _update_profile_embedding(user_id: int, resume_text: str) -> None:
    try:
        emb = await get_embedding(resume_text)
        with SessionLocal() as session:
            ext = session.query(models.CandidateExtension).filter(
                models.CandidateExtension.user_id == user_id
            ).first()
            if ext:
                ext.profile_embedding = json.dumps(emb)
                session.commit()
    except Exception as exc:
        logger.warning(f"Profile embedding update failed for user {user_id}: {exc}")


# ── Shared vault helper ───────────────────────────────────────────────────────

def _add_to_vault(
    db: Session,
    user: models.User,
    filename: str,
    resume_text: str,
    file_key: str | None = None,
) -> None:
    """Add a resume to the vault, enforcing the 3-resume limit (removes oldest)."""
    db.query(models.UserResume).filter(
        models.UserResume.user_id == user.id
    ).update({"is_primary": False})

    existing_count = db.query(models.UserResume).filter(
        models.UserResume.user_id == user.id
    ).count()

    if existing_count >= MAX_VAULT_SIZE:
        oldest = (
            db.query(models.UserResume)
            .filter(models.UserResume.user_id == user.id)
            .order_by(models.UserResume.uploaded_at.asc())
            .first()
        )
        if oldest:
            db.delete(oldest)

    db.add(models.UserResume(
        user_id=user.id,
        filename=filename,
        resume_text=resume_text,
        is_primary=True,
        file_key=file_key,
    ))


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/me")
def get_my_profile(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return _profile_response(current_user)


@router.patch("/me")
def update_my_profile(
    body: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if body.full_name is not None:
        name = body.full_name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="Name cannot be empty.")
        current_user.full_name = name

    if body.phone is not None:
        current_user.phone = body.phone.strip() or None

    db.commit()
    return _profile_response(current_user)


@router.patch("/recruiter")
def update_recruiter_profile(
    body: RecruiterProfileUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update recruiter-specific profile fields."""
    ext = current_user.recruiter_ext
    if not ext:
        raise HTTPException(status_code=403, detail="Recruiter profile required.")

    if body.company is not None:
        ext.company = body.company.strip() or None
    if body.is_third_party is not None:
        ext.is_third_party = body.is_third_party

    db.commit()
    return _profile_response(current_user)


@router.post("/resume")
async def upload_resume(
    background_tasks: BackgroundTasks,
    resume_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Upload or replace the candidate's active profile resume.
    Saves to the vault (max 3 — oldest removed if full) and sets as primary.
    """
    if not current_user.is_candidate:
        raise HTTPException(status_code=403, detail="Resume upload is only available for candidates.")

    content = await resume_file.read()
    filename = resume_file.filename or "resume"
    resume_text = parse_resume(content, filename)

    if not resume_text or len(resume_text.strip()) < 50:
        raise HTTPException(
            status_code=400,
            detail="Could not extract text from this file. Please upload a valid PDF, DOCX, or TXT.",
        )

    import asyncio
    loop = asyncio.get_event_loop()
    file_key = await loop.run_in_executor(
        None, upload_resume_file, content, filename, current_user.id
    )

    _add_to_vault(db, current_user, filename, resume_text, file_key)

    # Update the fast-access copy on the extension
    ext = current_user.candidate_ext
    ext.resume_text = resume_text
    ext.resume_filename = filename
    ext.career_profile = None
    ext.career_profile_updated_at = None
    ext.profile_embedding = None
    db.commit()

    background_tasks.add_task(_update_profile_embedding, current_user.id, resume_text)
    return _profile_response(current_user)


@router.post("/resumes/{resume_id}/set-active")
def set_active_resume(
    resume_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Set a vault resume as the active profile resume."""
    entry = db.query(models.UserResume).filter(
        models.UserResume.id == resume_id,
        models.UserResume.user_id == current_user.id,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Resume not found.")

    db.query(models.UserResume).filter(
        models.UserResume.user_id == current_user.id
    ).update({"is_primary": False})
    entry.is_primary = True

    ext = current_user.candidate_ext
    if ext:
        ext.resume_text = entry.resume_text
        ext.resume_filename = entry.filename
        ext.career_profile = None
        ext.career_profile_updated_at = None
        ext.profile_embedding = None
    db.commit()

    return _profile_response(current_user)


@router.delete("/resumes/{resume_id}")
def delete_vault_resume(
    resume_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete a resume from the vault."""
    entry = db.query(models.UserResume).filter(
        models.UserResume.id == resume_id,
        models.UserResume.user_id == current_user.id,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Resume not found.")

    was_primary = entry.is_primary
    db.delete(entry)
    db.commit()

    if was_primary:
        ext = current_user.candidate_ext
        latest = (
            db.query(models.UserResume)
            .filter(models.UserResume.user_id == current_user.id)
            .order_by(models.UserResume.uploaded_at.desc())
            .first()
        )
        if latest:
            latest.is_primary = True
            if ext:
                ext.resume_text = latest.resume_text
                ext.resume_filename = latest.filename
        else:
            if ext:
                ext.resume_text = None
                ext.resume_filename = None
        db.commit()

    return _profile_response(current_user)


@router.get("/resumes/{resume_id}/url")
def get_vault_resume_url(
    resume_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return a short-lived pre-signed S3 URL for a vault resume."""
    entry = db.query(models.UserResume).filter(
        models.UserResume.id == resume_id,
        models.UserResume.user_id == current_user.id,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Resume not found.")

    if not entry.file_key:
        return {"available": False}

    url = get_presigned_url(entry.file_key, entry.filename)
    if not url:
        return {"available": False}

    ext_map = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc": "application/msword",
        "txt": "text/plain",
    }
    file_ext = (entry.filename or "").rsplit(".", 1)[-1].lower()
    return {
        "available": True,
        "url": url,
        "filename": entry.filename,
        "content_type": ext_map.get(file_ext, "application/octet-stream"),
        "expires_in": settings.S3_PRESIGN_EXPIRY,
    }


async def _populate_college_record(college_name: str, college_url: str | None, user_id: int) -> None:
    """Background task: resolve logo + generate AI info and persist to College table."""
    import asyncio
    import json as _json
    from services.company_logo import resolve_company_logo
    from services.ai_service import generate_college_info

    try:
        loop = asyncio.get_event_loop()
        logo = await loop.run_in_executor(None, resolve_company_logo, college_url) if college_url else None
        ai_info = await generate_college_info(college_name, college_url)

        with SessionLocal() as session:
            college = session.query(models.College).filter(models.College.name == college_name).first()
            if college:
                if logo and not college.logo_url:
                    college.logo_url = logo
                if not college.short_name and ai_info.get("short_name"):
                    college.short_name = ai_info.get("short_name")
                if not college.ai_info:
                    college.ai_info = _json.dumps(ai_info)
                if college_url and not college.website_url:
                    college.website_url = college_url
            else:
                session.add(models.College(
                    name=college_name,
                    short_name=ai_info.get("short_name"),
                    logo_url=logo,
                    website_url=college_url,
                    ai_info=_json.dumps(ai_info),
                ))
            session.commit()

            # Back-fill college_id on all UserEducation rows for this institution
            college = session.query(models.College).filter(models.College.name == college_name).first()
            if college:
                session.query(models.UserEducation).filter(
                    models.UserEducation.institution_name == college_name,
                    models.UserEducation.college_id.is_(None),
                ).update({"college_id": college.id})
                session.commit()
    except Exception as exc:
        logger.error("College populate failed for %r: %s", college_name, exc)


@router.patch("/college")
async def update_college_info(
    body: CollegeUpdateBody,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Save college/university details for the current candidate."""
    if not current_user.is_candidate:
        raise HTTPException(status_code=403, detail="Only candidates can set college info.")

    ext = current_user.candidate_ext
    college_name = body.college_name.strip()

    # Update candidate extension
    ext.onboarding_completed = True
    ext.candidate_linkedin_url = (body.candidate_linkedin_url or "").strip() or None
    ext.current_company = (body.current_company or "").strip() or None

    # Upsert the primary UserEducation row
    primary_ed = db.query(models.UserEducation).filter(
        models.UserEducation.user_id == current_user.id,
        models.UserEducation.is_primary == True,  # noqa: E712
    ).first()

    # Resolve college FK if the College record already exists
    college_record = (
        db.query(models.College).filter(models.College.name == college_name).first()
        if college_name else None
    )

    if primary_ed:
        primary_ed.institution_name = college_name or primary_ed.institution_name
        primary_ed.graduation_year = body.graduation_year
        primary_ed.is_graduated = body.is_graduated
        primary_ed.degree_type = body.degree_type
        primary_ed.field_of_study = body.field_of_study
        primary_ed.college_id = college_record.id if college_record else None
    else:
        new_ed = models.UserEducation(
            user_id=current_user.id,
            institution_name=college_name,
            graduation_year=body.graduation_year,
            is_graduated=body.is_graduated,
            degree_type=body.degree_type,
            field_of_study=body.field_of_study,
            is_primary=True,
            college_id=college_record.id if college_record else None,
        )
        db.add(new_ed)

    # Ensure a College record exists; background task fills AI info + logo
    if college_name:
        existing = db.query(models.College).filter(models.College.name == college_name).first()
        if not existing:
            db.add(models.College(name=college_name, website_url=(body.college_url or "").strip() or None))
            db.flush()
        background_tasks.add_task(
            _populate_college_record,
            college_name,
            (body.college_url or "").strip() or None,
            current_user.id,
        )

    db.commit()
    return _profile_response(current_user)


@router.post("/refresh-career")
async def refresh_career_profile(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not current_user.is_candidate:
        raise HTTPException(status_code=403, detail="Career profiles are only available for candidates.")

    ext = current_user.candidate_ext
    if ext and ext.resume_text:
        resume_text = ext.resume_text
        source = ext.resume_filename or "profile resume"
    else:
        latest = (
            db.query(models.Application)
            .filter(models.Application.candidate_user_id == current_user.id)
            .order_by(models.Application.applied_at.desc())
            .first()
        )
        if not latest:
            raise HTTPException(
                status_code=400,
                detail="No resume on file. Upload a resume on your profile page first.",
            )
        resume_text = latest.resume_text
        source = f"application #{latest.job_id}"

    background_tasks.add_task(_refresh_career, current_user.id, resume_text)
    return {"message": "Analysis started. Check back in about 15 seconds.", "source": source}
