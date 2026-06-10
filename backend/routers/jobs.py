import json
import logging
import re
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from routers.auth import get_current_user, require_recruiter
from services.file_parser import parse_docx, parse_pdf

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/jobs", tags=["jobs"])

_AUDITED_FIELDS = [
    "title", "jd_text", "company", "location", "max_count", "min_match_score",
    "department", "employment_type", "salary_range_min", "salary_range_max",
    "remote_policy", "application_deadline",
]


# ── Slug utility ──────────────────────────────────────────────────────────────

def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    return re.sub(r"-+", "-", text).strip("-")


def _unique_slug(db: Session, title: str, location: str, exclude_id: int = None) -> str:
    base = _slugify(f"{title}-{location}")
    slug, n = base, 2
    while True:
        q = db.query(models.Job).filter(models.Job.slug == slug)
        if exclude_id:
            q = q.filter(models.Job.id != exclude_id)
        if not q.first():
            return slug
        slug, n = f"{base}-{n}", n + 1


# ── Stats helper ──────────────────────────────────────────────────────────────

def _enrich(job: models.Job, db: Session) -> schemas.JobResponse:
    apps = db.query(models.Application).filter(models.Application.job_id == job.id).all()
    total = len(apps)
    pool = sum(1 for a in apps if a.status == "accepted")
    avg = round(sum(a.match_score for a in apps) / total, 1) if total else 0.0

    resp = schemas.JobResponse.model_validate(job)
    resp.total_applicants = total
    resp.active_applications = pool
    resp.pool_count = pool
    resp.avg_score = avg

    if job.criteria:
        resp.eligibility_criteria = schemas.EligibilityCriteriaResponse(
            min_years_experience=job.criteria.min_years_experience,
            required_skills=json.loads(job.criteria.required_skills or "[]"),
            required_education=job.criteria.required_education,
        )
    return resp


# ── Eligibility criteria helpers ──────────────────────────────────────────────

def _save_criteria(db: Session, job_id: int, data: schemas.EligibilityCriteriaIn) -> None:
    criteria = db.query(models.EligibilityCriteria).filter(
        models.EligibilityCriteria.job_id == job_id
    ).first()
    if criteria is None:
        criteria = models.EligibilityCriteria(job_id=job_id)
        db.add(criteria)
    criteria.min_years_experience = data.min_years_experience
    criteria.required_skills = json.dumps(data.required_skills)
    criteria.required_education = data.required_education


def _delete_criteria(db: Session, job_id: int) -> None:
    db.query(models.EligibilityCriteria).filter(
        models.EligibilityCriteria.job_id == job_id
    ).delete()


# ── Audit log helper ──────────────────────────────────────────────────────────

def _audit(db: Session, job_id: int, user_id: int, field: str, old, new) -> None:
    if str(old) != str(new):
        db.add(models.JobAuditLog(
            job_id=job_id,
            user_id=user_id,
            field_name=field,
            old_value=str(old) if old is not None else None,
            new_value=str(new) if new is not None else None,
        ))


# ── Ownership guard ───────────────────────────────────────────────────────────

def _own_job(job_id: int, db: Session, current_user: models.User) -> models.Job:
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.recruiter_id != current_user.id:
        raise HTTPException(status_code=403, detail="You don't own this job posting.")
    return job


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("/", response_model=schemas.JobResponse)
async def create_job(
    title: str = Form(...),
    company: str = Form(default="Our Company"),
    location: str = Form(default="Remote"),
    max_count: int = Form(default=10),
    min_match_score: float = Form(default=80.0),
    department: Optional[str] = Form(default=None),
    employment_type: Optional[str] = Form(default=None),
    salary_range_min: Optional[int] = Form(default=None),
    salary_range_max: Optional[int] = Form(default=None),
    remote_policy: Optional[str] = Form(default=None),
    application_deadline: Optional[datetime] = Form(default=None),
    jd_text: Optional[str] = Form(default=None),
    jd_file: Optional[UploadFile] = File(default=None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_recruiter),
):
    final_jd = jd_text or ""
    if jd_file and not final_jd.strip():
        content = await jd_file.read()
        fname = (jd_file.filename or "").lower()
        if fname.endswith(".pdf"):
            final_jd = parse_pdf(content)
        elif fname.endswith(".docx") or fname.endswith(".doc"):
            final_jd = parse_docx(content)
        else:
            final_jd = content.decode("utf-8", errors="ignore")

    if not final_jd.strip():
        raise HTTPException(status_code=400, detail="Job description is required.")
    if len(final_jd.strip()) < 100:
        raise HTTPException(status_code=400, detail="Job description must be at least 100 characters.")

    job = models.Job(
        title=title,
        jd_text=final_jd,
        company=company,
        location=location,
        max_count=max_count,
        min_match_score=min_match_score,
        department=department,
        employment_type=employment_type,
        salary_range_min=salary_range_min,
        salary_range_max=salary_range_max,
        remote_policy=remote_policy,
        application_deadline=application_deadline,
        recruiter_id=current_user.id,
        status="draft",
        slug=_unique_slug(db, title, location),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return _enrich(job, db)


# ── Recruiter: my jobs dashboard ──────────────────────────────────────────────

@router.get("/my", response_model=schemas.JobListResponse)
def my_jobs(
    status: Optional[str] = Query(default=None, description="draft|published|closed"),
    search: Optional[str] = Query(default=None),
    sort_by: str = Query(default="created_at", description="created_at|total_applicants|avg_score"),
    sort_dir: str = Query(default="desc", description="asc|desc"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_recruiter),
):
    q = db.query(models.Job).filter(models.Job.recruiter_id == current_user.id)

    if status:
        q = q.filter(models.Job.status == status)
    if search:
        q = q.filter(models.Job.title.ilike(f"%{search}%"))

    jobs = q.all()

    # Attach stats so we can sort by computed fields
    enriched = [_enrich(j, db) for j in jobs]

    reverse = sort_dir == "desc"
    if sort_by == "total_applicants":
        enriched.sort(key=lambda r: r.total_applicants, reverse=reverse)
    elif sort_by == "avg_score":
        enriched.sort(key=lambda r: r.avg_score, reverse=reverse)
    else:
        enriched.sort(key=lambda r: r.created_at, reverse=reverse)

    total = len(enriched)
    start = (page - 1) * per_page
    paginated = enriched[start: start + per_page]

    return schemas.JobListResponse(
        jobs=paginated,
        total=total,
        page=page,
        pages=(-(-total // per_page)),  # ceiling division
        per_page=per_page,
    )


# ── Public: by slug ───────────────────────────────────────────────────────────

@router.get("/slug/{slug}", response_model=schemas.JobResponse)
def get_job_by_slug(slug: str, db: Session = Depends(get_db)):
    job = db.query(models.Job).filter(models.Job.slug == slug).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.status != "published":
        raise HTTPException(status_code=403, detail="This position is currently closed.")
    return _enrich(job, db)


# ── Public: list published jobs ───────────────────────────────────────────────

@router.get("/", response_model=schemas.JobListResponse)
def list_jobs(
    search: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    q = db.query(models.Job).filter(models.Job.status == "published")
    if search:
        q = q.filter(models.Job.title.ilike(f"%{search}%"))
    q = q.order_by(models.Job.published_at.desc())

    total = q.count()
    jobs = q.offset((page - 1) * per_page).limit(per_page).all()

    return schemas.JobListResponse(
        jobs=[_enrich(j, db) for j in jobs],
        total=total,
        page=page,
        pages=(-(-total // per_page)),
        per_page=per_page,
    )


# ── Get by ID ─────────────────────────────────────────────────────────────────

@router.get("/{job_id}", response_model=schemas.JobResponse)
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return _enrich(job, db)


# ── Edit ──────────────────────────────────────────────────────────────────────

@router.patch("/{job_id}", response_model=schemas.JobResponse)
def update_job(
    job_id: int,
    body: schemas.JobUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_recruiter),
):
    job = _own_job(job_id, db, current_user)

    for field in _AUDITED_FIELDS:
        new_val = getattr(body, field, None)
        if new_val is not None:
            old_val = getattr(job, field)
            _audit(db, job.id, current_user.id, field, old_val, new_val)
            setattr(job, field, new_val)

    # Regenerate slug if title or location changed
    if body.title or body.location:
        job.slug = _unique_slug(
            db,
            body.title or job.title,
            body.location or job.location,
            exclude_id=job.id,
        )

    # Eligibility criteria
    if body.eligibility_criteria is not None:
        old_criteria = job.criteria
        old_repr = (
            f"skills={json.loads(old_criteria.required_skills or '[]')},"
            f"edu={old_criteria.required_education},"
            f"exp={old_criteria.min_years_experience}"
        ) if old_criteria else "none"
        new_repr = (
            f"skills={body.eligibility_criteria.required_skills},"
            f"edu={body.eligibility_criteria.required_education},"
            f"exp={body.eligibility_criteria.min_years_experience}"
        )
        _audit(db, job.id, current_user.id, "eligibility_criteria", old_repr, new_repr)
        _save_criteria(db, job.id, body.eligibility_criteria)

    db.commit()
    db.refresh(job)
    return _enrich(job, db)


# ── Publish / Unpublish ───────────────────────────────────────────────────────

@router.post("/{job_id}/publish", response_model=schemas.JobResponse)
def publish_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_recruiter),
):
    job = _own_job(job_id, db, current_user)
    if job.status == "published":
        raise HTTPException(status_code=400, detail="Job is already published.")
    _audit(db, job.id, current_user.id, "status", job.status, "published")
    job.status = "published"
    job.published_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(job)
    return _enrich(job, db)


@router.post("/{job_id}/unpublish", response_model=schemas.JobResponse)
def unpublish_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_recruiter),
):
    job = _own_job(job_id, db, current_user)
    if job.status != "published":
        raise HTTPException(status_code=400, detail="Only published jobs can be unpublished.")
    _audit(db, job.id, current_user.id, "status", "published", "closed")
    job.status = "closed"
    db.commit()
    db.refresh(job)
    return _enrich(job, db)


# ── Audit log ─────────────────────────────────────────────────────────────────

@router.get("/{job_id}/audit-log", response_model=List[schemas.JobAuditLogResponse])
def get_audit_log(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_recruiter),
):
    _own_job(job_id, db, current_user)
    entries = db.query(models.JobAuditLog).filter(
        models.JobAuditLog.job_id == job_id
    ).order_by(models.JobAuditLog.changed_at.desc()).all()

    result = []
    for e in entries:
        actor = db.query(models.User).filter(models.User.id == e.user_id).first()
        result.append(schemas.JobAuditLogResponse(
            id=e.id,
            field_name=e.field_name,
            old_value=e.old_value,
            new_value=e.new_value,
            changed_at=e.changed_at,
            actor_name=actor.full_name if actor else "",
        ))
    return result
