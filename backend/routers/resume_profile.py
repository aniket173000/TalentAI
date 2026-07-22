"""
Resume profile router — structured extraction + skills normalisation.

Endpoints:
  POST /api/resume-profile/extract      Extract a structured profile from resume text.
  GET  /api/resume-profile/me           Fetch the authenticated user's latest profile.
  GET  /api/resume-profile/{profile_id} Fetch any profile by ID (owner or recruiter only).
"""

import hashlib
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

import models
from database import get_db
from routers.auth import get_current_user
from schemas import ExtractProfileRequest, ExtractedResumeProfile
from services.ai_service import extract_structured_profile as ai_extract
from services.skills_normalizer import normalize_skills

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/resume-profile", tags=["resume-profile"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _json_loads_safe(value: Optional[str], default):
    if not value:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def _profile_to_response(row: models.CandidateProfile) -> dict:
    confidence_raw = _json_loads_safe(row.confidence_scores, {})
    return {
        "id": row.id,
        "user_id": row.user_id,
        "application_id": row.application_id,
        "full_name": row.full_name,
        "email": row.email,
        "phone": row.phone,
        "location": row.location,
        "total_yoe": row.total_yoe,
        "work_history": _json_loads_safe(row.work_history, []),
        "raw_skills": _json_loads_safe(row.raw_skills, []),
        "normalized_skills": _json_loads_safe(row.normalized_skills, []),
        "unmapped_skills": _json_loads_safe(row.unmapped_skills, []),
        "education": _json_loads_safe(row.education, []),
        "projects": _json_loads_safe(row.projects, []),
        "certifications": _json_loads_safe(row.certifications, []),
        "confidence_scores": confidence_raw or None,
        "taxonomy_version": row.taxonomy_version,
        "extracted_at": row.extracted_at,
    }


def _upsert_unmapped_skills(db: Session, unmapped: list[str]) -> None:
    """Increment occurrence counts for unmapped skills in the review queue."""
    for skill in unmapped:
        existing = (
            db.query(models.SkillReviewQueue)
            .filter(models.SkillReviewQueue.skill_name == skill)
            .first()
        )
        if existing:
            existing.occurrence_count += 1
            existing.last_seen_at = func.now()
        else:
            db.add(models.SkillReviewQueue(skill_name=skill))
    db.commit()


# ── Core extraction (shared) ──────────────────────────────────────────────────

async def extract_and_store(
    db: Session,
    user_id: int,
    resume_text: str,
    application_id: Optional[int] = None,
) -> models.CandidateProfile:
    """LLM extraction + taxonomy normalisation, persisted as a CandidateProfile.

    SHA-256 cache: if the same resume text was already extracted for this user,
    the existing row is returned without calling the LLM. Shared by the /extract
    endpoint and the Cold Email agent (which self-heals users who uploaded a
    resume before structured extraction existed). Raises on LLM failure —
    callers wrap in their own HTTP error.
    """
    resume_hash = _sha256(resume_text)

    cached = (
        db.query(models.CandidateProfile)
        .filter(
            models.CandidateProfile.user_id == user_id,
            models.CandidateProfile.source_resume_hash == resume_hash,
        )
        .order_by(models.CandidateProfile.extracted_at.desc())
        .first()
    )
    if cached:
        logger.info("Cache hit for user=%d resume_hash=%s", user_id, resume_hash[:8])
        return cached

    raw = await ai_extract(resume_text)

    # Skills normalisation
    raw_skills: list[str] = raw.get("raw_skills") or []
    normalized, unmapped, taxonomy_version = normalize_skills(raw_skills)

    # Persist unmapped skills to review queue (background-safe — best effort)
    try:
        _upsert_unmapped_skills(db, unmapped)
    except Exception as exc:
        logger.warning("Failed to update skill_review_queue: %s", exc)

    confidence_raw = raw.get("confidence_scores") or {}
    profile = models.CandidateProfile(
        user_id=user_id,
        application_id=application_id,
        source_resume_hash=resume_hash,
        full_name=raw.get("full_name"),
        email=raw.get("email"),
        phone=raw.get("phone"),
        location=raw.get("location"),
        total_yoe=raw.get("total_yoe"),
        work_history=json.dumps(raw.get("work_history") or []),
        raw_skills=json.dumps(raw_skills),
        normalized_skills=json.dumps(normalized),
        unmapped_skills=json.dumps(unmapped),
        education=json.dumps(raw.get("education") or []),
        projects=json.dumps(raw.get("projects") or []),
        certifications=json.dumps(raw.get("certifications") or []),
        confidence_scores=json.dumps(confidence_raw),
        taxonomy_version=taxonomy_version,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)

    logger.info(
        "Extracted profile id=%d for user=%d — %d skills (%d unmapped)",
        profile.id, user_id, len(normalized), len(unmapped),
    )
    return profile


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "/extract",
    response_model=ExtractedResumeProfile,
    status_code=status.HTTP_201_CREATED,
    summary="Extract a structured profile from resume text",
)
async def extract_profile(
    body: ExtractProfileRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Runs LLM extraction + taxonomy normalisation on the provided resume text.

    If the same resume text (SHA-256 match) was already extracted for this
    user, the cached result is returned immediately without calling the LLM.
    """
    try:
        profile = await extract_and_store(db, current_user.id, body.resume_text, body.application_id)
    except Exception as exc:
        logger.error("LLM extraction failed for user=%d: %s", current_user.id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Resume extraction failed. Please try again.",
        ) from exc
    return _profile_to_response(profile)


@router.get(
    "/me",
    response_model=ExtractedResumeProfile,
    summary="Get the authenticated user's latest extracted profile",
)
def get_my_profile(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = (
        db.query(models.CandidateProfile)
        .filter(models.CandidateProfile.user_id == current_user.id)
        .order_by(models.CandidateProfile.extracted_at.desc())
        .first()
    )
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No extracted profile found. POST to /extract first.",
        )
    return _profile_to_response(profile)


@router.get(
    "/{profile_id}",
    response_model=ExtractedResumeProfile,
    summary="Fetch a specific extracted profile by ID",
)
def get_profile_by_id(
    profile_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(models.CandidateProfile).filter(
        models.CandidateProfile.id == profile_id
    ).first()

    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found.")

    # Candidates can only see their own profiles; recruiters can see any
    if current_user.is_candidate and not current_user.is_recruiter and profile.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    return _profile_to_response(profile)
