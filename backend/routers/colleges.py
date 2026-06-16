import asyncio
import json
from collections import Counter
from typing import List
from urllib.parse import unquote

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import case, func
from sqlalchemy.orm import Session

import models
from database import get_db
from schemas import (
    CampusJobResponse,
    CollegeAIInfo,
    CollegeCandidateEntry,
    CollegeDetailResponse,
    CollegeInfo,
    CollegeTalentStats,
)
from services.company_logo import resolve_company_logo

router = APIRouter(prefix="/api/colleges", tags=["colleges"])


# ── helpers ───────────────────────────────────────────────────────────────────

def _college_info_from_row(college: models.College | None) -> CollegeAIInfo | None:
    if not college or not college.ai_info:
        return None
    try:
        data = json.loads(college.ai_info)
        return CollegeAIInfo(**{k: data.get(k) for k in CollegeAIInfo.model_fields})
    except Exception:
        return None


def _compute_talent_stats(users: list[models.User]) -> CollegeTalentStats:
    """Derive top companies and top skills from alumni career profiles."""
    company_counter: Counter = Counter()
    skill_counter: Counter = Counter()

    for u in users:
        # Current company from explicit field or career profile
        if u.current_company:
            company_counter[u.current_company] += 1

        if u.career_profile:
            try:
                profile = json.loads(u.career_profile)
                role = profile.get("detected_role", "")
                # skills from strengths
                for s in profile.get("strengths", []):
                    skill_counter[s] += 1
            except Exception:
                pass

        # Skills from candidate_profiles (structured extraction)
        # (skipped here to keep query simple — could join if needed)

    return CollegeTalentStats(
        top_companies=[c for c, _ in company_counter.most_common(6)],
        top_skills=[s for s, _ in skill_counter.most_common(8)],
    )


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[CollegeInfo])
def list_colleges(db: Session = Depends(get_db)):
    """All colleges with member counts, logo, and AI short name."""
    rows = (
        db.query(
            models.User.college_name,
            func.sum(case((models.User.is_graduated == True, 1), else_=0)).label("alumni"),  # noqa: E712
            func.count(models.User.id).label("total"),
        )
        .filter(
            models.User.role == "candidate",
            models.User.college_name.isnot(None),
            models.User.college_name != "",
        )
        .group_by(models.User.college_name)
        .order_by(func.count(models.User.id).desc())
        .all()
    )

    # Fetch College records in one query
    names = [r.college_name for r in rows]
    college_map: dict[str, models.College] = {}
    if names:
        for c in db.query(models.College).filter(models.College.name.in_(names)).all():
            college_map[c.name] = c

    result = []
    for row in rows:
        total = row.total or 0
        alumni_count = int(row.alumni or 0)
        college = college_map.get(row.college_name)
        result.append(
            CollegeInfo(
                college_name=row.college_name,
                short_name=college.short_name if college else None,
                college_logo_url=college.logo_url if college else None,
                current_students=total - alumni_count,
                alumni=alumni_count,
                total=total,
            )
        )
    return result


class ResolveLogoRequest(BaseModel):
    url: str


@router.post("/resolve-logo")
async def resolve_college_logo(body: ResolveLogoRequest):
    """Resolve the best logo URL from a college website or LinkedIn school URL."""
    loop = asyncio.get_event_loop()
    logo = await loop.run_in_executor(None, resolve_company_logo, body.url)
    return {"logo_url": logo}


@router.get("/search")
def search_colleges(
    q: str = Query(default="", min_length=0),
    db: Session = Depends(get_db),
):
    """Return matching college names for autocomplete."""
    base = (
        db.query(models.User.college_name)
        .filter(
            models.User.role == "candidate",
            models.User.college_name.isnot(None),
            models.User.college_name != "",
        )
        .distinct()
    )
    if q.strip():
        base = base.filter(models.User.college_name.ilike(f"%{q.strip()}%"))
    return {"colleges": [r.college_name for r in base.limit(20).all()]}


@router.get("/{college_name}/campus-jobs", response_model=List[CampusJobResponse])
def get_campus_jobs(college_name: str, db: Session = Depends(get_db)):
    """Published campus hiring jobs targeted at this college."""
    decoded = unquote(college_name)
    jobs = (
        db.query(models.Job)
        .filter(
            models.Job.is_campus_hiring == True,  # noqa: E712
            models.Job.campus_college_name == decoded,
            models.Job.status == "published",
        )
        .order_by(models.Job.published_at.desc())
        .all()
    )
    return [CampusJobResponse.model_validate(j) for j in jobs]


@router.get("/{college_name}", response_model=CollegeDetailResponse)
def get_college_detail(college_name: str, db: Session = Depends(get_db)):
    """Full college detail: AI info, talent stats, and candidate roster."""
    decoded = unquote(college_name)

    users = (
        db.query(models.User)
        .filter(
            models.User.role == "candidate",
            models.User.college_name == decoded,
        )
        .order_by(models.User.created_at.asc())
        .all()
    )

    college = db.query(models.College).filter(models.College.name == decoded).first()

    current_students: list[CollegeCandidateEntry] = []
    alumni: list[CollegeCandidateEntry] = []
    for u in users:
        entry = CollegeCandidateEntry(
            id=u.id,
            full_name=u.full_name,
            email=u.email,
            graduation_year=u.graduation_year,
            is_graduated=bool(u.is_graduated),
            candidate_linkedin_url=u.candidate_linkedin_url,
            current_company=u.current_company,
        )
        if u.is_graduated:
            alumni.append(entry)
        else:
            current_students.append(entry)

    return CollegeDetailResponse(
        college_name=decoded,
        short_name=college.short_name if college else None,
        college_logo_url=college.logo_url if college else None,
        website_url=college.website_url if college else None,
        ai_info=_college_info_from_row(college),
        talent_stats=_compute_talent_stats(users),
        current_students=current_students,
        alumni=alumni,
    )
