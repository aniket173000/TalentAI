"""
Operator/admin panel — platform-wide visibility. Access is gated by an email
allowlist (settings.ADMIN_EMAILS), not a DB role.

  GET /api/admin/overview          headline counts across the platform
  GET /api/admin/feedback          user feedback, AI-triaged (filterable)
  GET /api/admin/users             recent / searched users
  GET /api/admin/jobs              recent jobs with applicant counts
"""
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
from database import get_db
from routers.auth import get_current_user
from services.admin_access import is_admin_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if not is_admin_email(user.email):
        raise HTTPException(status_code=403, detail="Admin access required.")
    return user


def _since(days: int) -> datetime:
    return datetime.utcnow() - timedelta(days=days)


def _group_counts(db: Session, column) -> dict:
    rows = db.query(column, func.count()).group_by(column).all()
    return {(k or "unknown"): n for k, n in rows}


@router.get("/overview")
def overview(db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    week = _since(7)

    total_users = db.query(func.count(models.User.id)).scalar() or 0
    candidates = db.query(func.count(models.CandidateExtension.id)).scalar() or 0
    recruiters = db.query(func.count(models.RecruiterExtension.id)).scalar() or 0
    # Dual = users having both extensions
    dual = (
        db.query(func.count(models.User.id))
        .join(models.CandidateExtension, models.CandidateExtension.user_id == models.User.id)
        .join(models.RecruiterExtension, models.RecruiterExtension.user_id == models.User.id)
        .scalar()
    ) or 0
    verified = db.query(func.count(models.User.id)).filter(models.User.email_verified == True).scalar() or 0
    new_users_7d = db.query(func.count(models.User.id)).filter(models.User.created_at >= week).scalar() or 0

    total_jobs = db.query(func.count(models.Job.id)).scalar() or 0
    jobs_by_status = _group_counts(db, models.Job.status)
    new_jobs_7d = db.query(func.count(models.Job.id)).filter(models.Job.created_at >= week).scalar() or 0

    total_apps = db.query(func.count(models.Application.id)).scalar() or 0
    apps_by_status = _group_counts(db, models.Application.candidate_status)
    new_apps_7d = db.query(func.count(models.Application.id)).filter(models.Application.applied_at >= week).scalar() or 0

    referral_posts = db.query(func.count(models.ReferralPost.id)).scalar() or 0
    referral_apps = db.query(func.count(models.ReferralApplication.id)).scalar() or 0
    colleges = db.query(func.count(models.College.id)).scalar() or 0

    feedback_total = db.query(func.count(models.ProductFeedback.id)).scalar() or 0
    feedback_by_category = _group_counts(db, models.ProductFeedback.category)
    feedback_by_priority = _group_counts(db, models.ProductFeedback.priority)
    open_bugs = (
        db.query(func.count(models.ProductFeedback.id))
        .filter(models.ProductFeedback.category == "bug")
        .scalar()
    ) or 0

    return {
        "users": {
            "total": total_users,
            "candidates": candidates,
            "recruiters": recruiters,
            "dual_mode": dual,
            "verified": verified,
            "new_7d": new_users_7d,
        },
        "jobs": {
            "total": total_jobs,
            "by_status": jobs_by_status,
            "new_7d": new_jobs_7d,
        },
        "applications": {
            "total": total_apps,
            "by_status": apps_by_status,
            "new_7d": new_apps_7d,
        },
        "referrals": {"posts": referral_posts, "applications": referral_apps},
        "colleges": {"total": colleges},
        "feedback": {
            "total": feedback_total,
            "by_category": feedback_by_category,
            "by_priority": feedback_by_priority,
            "open_bugs": open_bugs,
        },
        # No billing layer yet — surfaced as null so the UI can show "coming soon".
        "revenue": None,
    }


@router.get("/feedback")
def feedback(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
    category: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    q = db.query(models.ProductFeedback)
    if category:
        q = q.filter(models.ProductFeedback.category == category)
    if priority:
        q = q.filter(models.ProductFeedback.priority == priority)
    rows = q.order_by(models.ProductFeedback.created_at.desc()).limit(limit).all()
    return {
        "count": len(rows),
        "items": [
            {
                "id": r.id,
                "name": r.name,
                "email": r.email,
                "mood": r.mood,
                "category": r.category,
                "summary": r.summary,
                "priority": r.priority,
                "sentiment": r.sentiment,
                "affected_area": r.affected_area,
                "raw_text": r.raw_text,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


@router.get("/users")
def users(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
    q: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    query = db.query(models.User)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (models.User.email.ilike(like)) | (models.User.full_name.ilike(like))
        )
    total = query.count()
    rows = query.order_by(models.User.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": u.id,
                "full_name": u.full_name,
                "email": u.email,
                "phone": u.phone,
                "is_candidate": u.is_candidate,
                "is_recruiter": u.is_recruiter,
                "email_verified": bool(u.email_verified),
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in rows
        ],
    }


@router.get("/jobs")
def jobs(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_admin),
    limit: int = Query(50, ge=1, le=200),
):
    rows = db.query(models.Job).order_by(models.Job.created_at.desc()).limit(limit).all()
    # Batch applicant counts
    counts = dict(
        db.query(models.Application.job_id, func.count(models.Application.id))
        .group_by(models.Application.job_id)
        .all()
    )
    return {
        "count": len(rows),
        "items": [
            {
                "id": j.id,
                "title": j.title,
                "company": j.company,
                "status": j.status,
                "is_campus_hiring": bool(j.is_campus_hiring),
                "applicants": counts.get(j.id, 0),
                "created_at": j.created_at.isoformat() if j.created_at else None,
            }
            for j in rows
        ],
    }
