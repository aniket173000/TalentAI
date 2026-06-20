"""
Recruiter candidate corpus — the pull side of the retrieval funnel.

Endpoints (all require a recruiter capability):
  POST   /api/candidates/upload        Upload a resume file (PDF/DOCX) into the corpus.
  POST   /api/candidates/upload-text   Ingest a candidate from raw resume text.
  GET    /api/candidates               List the recruiter's corpus (paginated).
  GET    /api/candidates/{id}          Full parsed profile + resume for one candidate.
  DELETE /api/candidates/{id}          Remove a candidate from the corpus.
"""
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from database import get_db
from routers.auth import require_recruiter
from services import storage_service
from services.candidate_ingest import ingest_resume
from services.file_parser import parse_resume

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/candidates", tags=["candidates"])


class UploadTextRequest(BaseModel):
    resume_text: str
    filename: Optional[str] = None


def _json(value, default):
    if not value:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def _summary(c: models.Candidate) -> dict:
    skills = _json(c.normalized_skills, [])
    return {
        "id": c.id,
        "full_name": c.full_name,
        "headline": c.headline,
        "location": c.location,
        "total_yoe": c.total_yoe,
        "skill_count": len(skills),
        "top_skills": skills[:8],
        "source": c.source,
        "ingest_status": c.ingest_status,
        "has_embedding": bool(c.profile_embedding),
        "created_at": c.created_at,
    }


def _detail(c: models.Candidate) -> dict:
    return {
        **_summary(c),
        "email": c.email,
        "phone": c.phone,
        "work_history": _json(c.work_history, []),
        "raw_skills": _json(c.raw_skills, []),
        "normalized_skills": _json(c.normalized_skills, []),
        "unmapped_skills": _json(c.unmapped_skills, []),
        "education": _json(c.education, []),
        "projects": _json(c.projects, []),
        "certifications": _json(c.certifications, []),
        "profile_summary": c.profile_summary,
        "taxonomy_version": c.taxonomy_version,
        "resume_filename": c.resume_filename,
        "resume_text": c.resume_text,
        "ingest_error": c.ingest_error,
    }


def _owned_or_404(candidate_id: int, recruiter: models.User, db: Session) -> models.Candidate:
    c = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    # Recruiters can view platform candidates (recruiter_id is None) and their own
    # manually-uploaded ones, but not another recruiter's private uploads.
    if not c or (c.recruiter_id is not None and c.recruiter_id != recruiter.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found.")
    return c


@router.post("/upload", status_code=status.HTTP_201_CREATED,
             summary="Upload a resume file into the recruiter's corpus")
async def upload_candidate(
    resume_file: UploadFile = File(...),
    recruiter: models.User = Depends(require_recruiter),
    db: Session = Depends(get_db),
):
    content = await resume_file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file.")

    resume_text = parse_resume(content, resume_file.filename or "resume")
    if not resume_text or not resume_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Could not extract text from the file. Supported: PDF, DOCX.",
        )

    # Best-effort original-file storage (no-op if S3 is not configured).
    file_key = None
    try:
        if storage_service.s3_enabled():
            file_key = storage_service.upload_resume_file(
                content, resume_file.filename or "resume", recruiter.id
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("S3 upload failed (continuing text-only): %s", exc)

    candidate = await ingest_resume(
        db, recruiter.id, resume_text,
        resume_filename=resume_file.filename, resume_file_key=file_key,
    )
    return _detail(candidate)


@router.post("/upload-text", status_code=status.HTTP_201_CREATED,
             summary="Ingest a candidate from raw resume text")
async def upload_candidate_text(
    body: UploadTextRequest,
    recruiter: models.User = Depends(require_recruiter),
    db: Session = Depends(get_db),
):
    if not body.resume_text or not body.resume_text.strip():
        raise HTTPException(status_code=400, detail="resume_text is required.")
    candidate = await ingest_resume(
        db, recruiter.id, body.resume_text, resume_filename=body.filename,
    )
    return _detail(candidate)


@router.get("", summary="List the recruiter's candidate corpus")
def list_candidates(
    recruiter: models.User = Depends(require_recruiter),
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    q = db.query(models.Candidate).filter(models.Candidate.recruiter_id == recruiter.id)
    if status_filter:
        q = q.filter(models.Candidate.ingest_status == status_filter)
    total = q.count()
    rows = (
        q.order_by(models.Candidate.created_at.desc())
        .offset(offset).limit(limit).all()
    )
    return {"total": total, "limit": limit, "offset": offset,
            "candidates": [_summary(c) for c in rows]}


@router.get("/{candidate_id}", summary="Full parsed profile for one candidate")
def get_candidate(
    candidate_id: int,
    recruiter: models.User = Depends(require_recruiter),
    db: Session = Depends(get_db),
):
    return _detail(_owned_or_404(candidate_id, recruiter, db))


@router.delete("/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Remove a candidate from the corpus")
def delete_candidate(
    candidate_id: int,
    recruiter: models.User = Depends(require_recruiter),
    db: Session = Depends(get_db),
):
    c = _owned_or_404(candidate_id, recruiter, db)
    db.delete(c)
    db.commit()
