import asyncio
import json
from collections import Counter
from typing import List
from urllib.parse import unquote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_

import models
from database import get_db
from routers.auth import get_current_user
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
        c = u.candidate_ext
        if not c:
            continue

        if c.current_company:
            company_counter[c.current_company] += 1

        if c.career_profile:
            try:
                profile = json.loads(c.career_profile)
                for s in profile.get("strengths", []):
                    skill_counter[s] += 1
            except Exception:
                pass

    return CollegeTalentStats(
        top_companies=[co for co, _ in company_counter.most_common(6)],
        top_skills=[s for s, _ in skill_counter.most_common(8)],
    )


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[CollegeInfo])
def list_colleges(db: Session = Depends(get_db)):
    """All colleges with member counts, logo, and AI short name."""
    rows = (
        db.query(
            models.UserEducation.institution_name.label("college_name"),
            func.sum(
                case((models.UserEducation.is_graduated == True, 1), else_=0)  # noqa: E712
            ).label("alumni"),
            func.count(models.UserEducation.user_id).label("total"),
        )
        # Only count users that actually have a candidate extension (= are candidates)
        .join(
            models.CandidateExtension,
            models.UserEducation.user_id == models.CandidateExtension.user_id,
        )
        .filter(
            models.UserEducation.is_primary == True,  # noqa: E712
            models.UserEducation.institution_name.isnot(None),
            models.UserEducation.institution_name != "",
        )
        .group_by(models.UserEducation.institution_name)
        .order_by(func.count(models.UserEducation.user_id).desc())
        .all()
    )

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
    """Return matching college names for autocomplete (DB only)."""
    base = (
        db.query(models.UserEducation.institution_name)
        .join(
            models.CandidateExtension,
            models.UserEducation.user_id == models.CandidateExtension.user_id,
        )
        .filter(
            models.UserEducation.is_primary == True,  # noqa: E712
            models.UserEducation.institution_name.isnot(None),
            models.UserEducation.institution_name != "",
        )
        .distinct()
    )
    if q.strip():
        base = base.filter(models.UserEducation.institution_name.ilike(f"%{q.strip()}%"))
    return {"colleges": [r.institution_name for r in base.limit(20).all()]}


@router.get("/ai-search")
async def ai_search_colleges(q: str = Query(..., min_length=2)):
    """AI-powered fallback: find college names for obscure / unrecognised queries."""
    from config import settings
    prompt = (
        f'The user typed "{q}" as their college/university name. '
        "List up to 5 real Indian colleges or universities that best match this query. "
        "Use the most commonly known short name for each "
        "(e.g. 'IIT Bombay' not 'Indian Institute of Technology Bombay', "
        "'NIT Trichy' not 'National Institute of Technology Tiruchirappalli'). "
        'Return only JSON: {"colleges": ["name1", "name2", ...]}'
    )
    try:
        if settings.AI_PROVIDER == "claude" and settings.ANTHROPIC_API_KEY:
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            resp = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            text = resp.content[0].text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            data = json.loads(text)
        else:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            resp = await client.chat.completions.create(
                model="gpt-4o-mini",
                temperature=0,
                response_format={"type": "json_object"},
                messages=[{"role": "user", "content": prompt}],
            )
            data = json.loads(resp.choices[0].message.content)
        return {"colleges": data.get("colleges", [])[:5]}
    except Exception:
        return {"colleges": []}


@router.get("/{college_name}/campus-jobs", response_model=List[CampusJobResponse])
def get_campus_jobs(
    college_name: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Published campus hiring jobs targeted at this college.
    Private: visible only to recruiters and to members (current/alumni) of the
    target college — checked against ALL of the user's education records.
    """
    decoded = unquote(college_name)

    if not current_user.is_recruiter:
        member_of = {
            (e.institution_name or "").strip().lower()
            for e in (current_user.education_records or [])
        }
        if decoded.strip().lower() not in member_of:
            raise HTTPException(
                status_code=403,
                detail="Campus hiring posts are visible only to members of this college.",
            )

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
def get_college_detail(
    college_name: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Full college detail: AI info, talent stats, and candidate roster."""
    decoded = unquote(college_name)

    users = (
        db.query(models.User)
        .join(models.CandidateExtension, models.User.id == models.CandidateExtension.user_id)
        .join(
            models.UserEducation,
            and_(
                models.UserEducation.user_id == models.User.id,
                models.UserEducation.institution_name == decoded,
                models.UserEducation.is_primary == True,  # noqa: E712
            ),
        )
        .options(
            joinedload(models.User.candidate_ext),
            joinedload(models.User.education_records),
        )
        .order_by(models.User.created_at.asc())
        .all()
    )

    college = db.query(models.College).filter(models.College.name == decoded).first()

    # Lazy backfill: older colleges may predate logo resolution. Kick off a
    # best-effort background populate (idempotent — only fills missing fields).
    if not college or not college.logo_url:
        from routers.profile import _populate_college_record
        background_tasks.add_task(
            _populate_college_record,
            decoded,
            college.website_url if college else None,
            None,
        )

    current_students: list[CollegeCandidateEntry] = []
    alumni: list[CollegeCandidateEntry] = []

    for u in users:
        ed = u.primary_education
        c = u.candidate_ext
        entry = CollegeCandidateEntry(
            id=u.id,
            full_name=u.full_name,
            email=u.email,
            graduation_year=ed.graduation_year if ed else None,
            is_graduated=bool(ed.is_graduated) if ed else False,
            candidate_linkedin_url=c.candidate_linkedin_url if c else None,
            current_company=c.current_company if c else None,
        )
        if ed and ed.is_graduated:
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
