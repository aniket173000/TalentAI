import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
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
    company: Optional[str] = None


# ── Response helper ───────────────────────────────────────────────────────────

def _profile_response(user: models.User) -> dict:
    career = None
    if user.career_profile:
        try:
            career = json.loads(user.career_profile)
        except Exception:
            career = None

    vault = [
        {
            "id": r.id,
            "filename": r.filename,
            "is_primary": r.is_primary,
            "uploaded_at": r.uploaded_at.isoformat() if r.uploaded_at else None,
        }
        for r in user.resumes
    ]

    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "phone": user.phone,
        "company": user.company,
        "is_third_party_recruiter": user.is_third_party_recruiter,
        "linkedin_verified": user.linkedin_verified,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "resume_filename": user.resume_filename,
        "career_profile": career,
        "career_profile_updated_at": (
            user.career_profile_updated_at.isoformat()
            if user.career_profile_updated_at else None
        ),
        "resumes": vault,
    }


# ── Background tasks ──────────────────────────────────────────────────────────

async def _refresh_career(user_id: int, resume_text: str) -> None:
    try:
        profile = await generate_career_profile(resume_text)
        with SessionLocal() as session:
            user = session.query(models.User).filter(models.User.id == user_id).first()
            if user:
                user.career_profile = json.dumps(profile)
                user.career_profile_updated_at = datetime.utcnow()
                session.commit()
    except Exception as exc:
        logger.error(f"Career profile generation failed for user {user_id}: {exc}")


async def _update_profile_embedding(user_id: int, resume_text: str) -> None:
    try:
        emb = await get_embedding(resume_text)
        with SessionLocal() as session:
            user = session.query(models.User).filter(models.User.id == user_id).first()
            if user:
                user.profile_embedding = json.dumps(emb)
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

    new_entry = models.UserResume(
        user_id=user.id,
        filename=filename,
        resume_text=resume_text,
        is_primary=True,
        file_key=file_key,
    )
    db.add(new_entry)


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

    if body.company is not None:
        current_user.company = body.company.strip() or None

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
    if current_user.role != "candidate":
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

    current_user.resume_text = resume_text
    current_user.resume_filename = filename
    current_user.career_profile = None
    current_user.career_profile_updated_at = None
    current_user.profile_embedding = None
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

    current_user.resume_text = entry.resume_text
    current_user.resume_filename = entry.filename
    current_user.career_profile = None
    current_user.career_profile_updated_at = None
    current_user.profile_embedding = None
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
        latest = (
            db.query(models.UserResume)
            .filter(models.UserResume.user_id == current_user.id)
            .order_by(models.UserResume.uploaded_at.desc())
            .first()
        )
        if latest:
            latest.is_primary = True
            current_user.resume_text = latest.resume_text
            current_user.resume_filename = latest.filename
        else:
            current_user.resume_text = None
            current_user.resume_filename = None
        db.commit()

    return _profile_response(current_user)


@router.get("/resumes/{resume_id}/url")
def get_vault_resume_url(
    resume_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Return a short-lived pre-signed S3 URL for a vault resume.
    Only the owner can request this URL.
    """
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

    ext = (entry.filename or "").rsplit(".", 1)[-1].lower()
    content_type_map = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc": "application/msword",
        "txt": "text/plain",
    }
    return {
        "available": True,
        "url": url,
        "filename": entry.filename,
        "content_type": content_type_map.get(ext, "application/octet-stream"),
        "expires_in": settings.S3_PRESIGN_EXPIRY,
    }


@router.post("/refresh-career")
async def refresh_career_profile(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != "candidate":
        raise HTTPException(status_code=403, detail="Career profiles are only available for candidates.")

    if current_user.resume_text:
        resume_text = current_user.resume_text
        source = current_user.resume_filename or "profile resume"
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
