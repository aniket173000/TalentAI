"""
Semantic Scoring API — E5-S2 (Skill Matching) + E5-S3 (Experience Depth)
                      + E5-S4 (Education) + E5-S5 (Projects)

POST /api/semantic/score
  Semantic skill match sub-score (0–30) with per-group transparency.

POST /api/semantic/experience-score
  Experience depth sub-score (0–30): YoE, seniority, progression, domain.

POST /api/semantic/education-score
  Education & certification sub-score (0–20): degree level, field relevance, certs.

POST /api/semantic/projects-score
  Project & portfolio relevance sub-score (0–20): semantic relevance + complexity signals.

GET  /api/semantic/cache-stats
  Embedding LRU cache hit rate — latency monitoring.
"""

import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import models
from database import get_db
from routers.auth import get_current_user, require_recruiter
from services.education import score_education
from services.experience import score_experience
from services.projects import score_projects
from services.semantic import _embedder, score_skills

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/semantic", tags=["semantic"])


# ── Request / Response schemas ────────────────────────────────────────────────

class SkillScoreRequest(BaseModel):
    candidate_skills: List[str] = Field(
        ...,
        min_length=1,
        description="Normalised skill names from the candidate's resume.",
        examples=[["Python", "PostgreSQL", "ETL pipeline engineer", "AWS"]],
    )
    job_id: Optional[int] = Field(
        default=None,
        description="Fetch skill groups from this job's parsed JD requirements.",
    )
    skill_groups: Optional[List[dict]] = Field(
        default=None,
        description=(
            "Provide skill groups directly (for testing without a DB record). "
            "Ignored when job_id is supplied."
        ),
    )

    class Config:
        json_schema_extra = {
            "example": {
                "candidate_skills": ["Python", "PostgreSQL", "ETL pipeline engineer"],
                "job_id": 1,
            }
        }


class ExperienceScoreRequest(BaseModel):
    # Option A: fetch from DB
    application_id: Optional[int] = Field(default=None, description="Fetch work history from CandidateProfile.")
    job_id: Optional[int] = Field(default=None, description="Fetch JD requirements from Job row.")
    # Option B: direct input (testing / pipeline)
    work_history: Optional[List[dict]] = Field(default=None, description="Raw work_history list.")
    total_yoe: Optional[float] = Field(default=None, description="AI-extracted total years of experience.")
    jd_data: Optional[dict] = Field(default=None, description="JD requirements dict (seniority, min_years_experience, job_function).")


class EducationScoreRequest(BaseModel):
    # Option A: fetch from DB
    application_id: Optional[int] = Field(
        default=None,
        description="Fetch education & certifications from CandidateProfile.",
    )
    job_id: Optional[int] = Field(
        default=None,
        description="Fetch JD requirements from Job row.",
    )
    # Option B: direct input (testing / pipeline)
    education: Optional[List[dict]] = Field(
        default=None,
        description="List of EducationEntry dicts {degree, institution, year}.",
    )
    certifications: Optional[List[str]] = Field(
        default=None,
        description="List of certification strings.",
    )
    jd_data: Optional[dict] = Field(
        default=None,
        description="JD requirements dict (education_level, education_field, job_function, required_skill_groups).",
    )

    class Config:
        json_schema_extra = {
            "example": {
                "education": [
                    {"degree": "B.Tech Computer Science", "institution": "IIT Bombay", "year": "2019"}
                ],
                "certifications": ["AWS Certified Solutions Architect", "PMP"],
                "jd_data": {
                    "education_level": "Bachelor",
                    "education_field": "Computer Science",
                    "job_function": "engineering",
                },
            }
        }


class ProjectsScoreRequest(BaseModel):
    # Option A: fetch from DB
    application_id: Optional[int] = Field(
        default=None,
        description="Fetch projects list from CandidateProfile.",
    )
    job_id: Optional[int] = Field(
        default=None,
        description="Fetch JD requirements and title from Job row.",
    )
    # Option B: direct input (testing / pipeline)
    projects: Optional[List[dict]] = Field(
        default=None,
        description="List of ProjectEntry dicts {name, description, technologies, url?}.",
    )
    jd_title: Optional[str] = Field(
        default=None,
        description="Job title string used in the JD context for embedding.",
    )
    jd_data: Optional[dict] = Field(
        default=None,
        description="JD requirements dict (job_function, required_skill_groups, etc.).",
    )

    class Config:
        json_schema_extra = {
            "example": {
                "projects": [
                    {
                        "name": "Real-time Fraud Detection System",
                        "description": "Built ML pipeline serving 2M transactions/day with 5-engineer team. Reduced false positives by 40%.",
                        "technologies": ["Python", "Kafka", "TensorFlow"],
                        "url": "https://github.com/user/fraud-detection",
                    }
                ],
                "jd_title": "Senior Machine Learning Engineer",
                "jd_data": {
                    "job_function": "data",
                    "required_skill_groups": [{"skills": ["Python", "ML", "TensorFlow"], "match_type": "any", "required": True, "context": ""}],
                },
            }
        }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/score")
async def semantic_skill_score(
    body: SkillScoreRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Compute the 0–30 semantic skill match sub-score for a candidate.

    The breakdown shows exactly which JD skill groups were satisfied, which
    candidate skill matched each JD skill, and at what similarity score —
    making the AI's decision transparent and auditable.

    Example use: pass a candidate's normalized_skills from their CandidateProfile
    alongside the job_id to see which required skills they're missing.
    """
    # ── Resolve skill groups ──────────────────────────────────────────────────
    skill_groups: list[dict] = []

    if body.job_id is not None:
        job = db.query(models.Job).filter(models.Job.id == body.job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found.")

        # Only recruiter or the job's candidates can use this for another job
        # (open to any authenticated user for now — tighten per access policy)
        if job.jd_parse_status != "done" or not job.jd_requirements:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"JD requirements not yet parsed for job {body.job_id}. "
                    "Status: " + (job.jd_parse_status or "not started") + ". "
                    "Trigger parsing via POST /api/jobs/{job_id}/parse-requirements."
                ),
            )

        try:
            req = json.loads(job.jd_requirements)
            skill_groups = req.get("required_skill_groups", [])
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to deserialise JD requirements.")

    elif body.skill_groups is not None:
        skill_groups = body.skill_groups
    else:
        raise HTTPException(
            status_code=422,
            detail="Provide either job_id or skill_groups.",
        )

    if not skill_groups:
        return {
            "score": 30.0,
            "max_score": 30.0,
            "total_required_groups": 0,
            "satisfied_groups": 0,
            "match_percentage": 100.0,
            "note": "No required skill groups defined for this job — full skill score awarded.",
            "satisfied_outcomes": [],
            "missing_outcomes": [],
        }

    # ── Run semantic matching ─────────────────────────────────────────────────
    try:
        breakdown = await score_skills(
            candidate_skills=body.candidate_skills,
            skill_groups=skill_groups,
        )
    except Exception as exc:
        logger.error("Semantic skill scoring failed: %s", exc)
        raise HTTPException(status_code=503, detail=f"Semantic scoring service error: {exc}")

    return breakdown.to_dict()


@router.post("/experience-score")
def experience_depth_score(
    body: "ExperienceScoreRequest",
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Compute the 0–30 experience depth sub-score for a candidate.

    Accepts either:
      - application_id + job_id  → fetches work_history from CandidateProfile
                                    and JD requirements from the Job row
      - work_history + total_yoe + jd_data  → direct input (for testing)

    The breakdown includes:
      - YoE ratio vs JD requirement
      - Seniority match (JD seniority vs candidate's most-recent title)
      - Career progression signals (upward / lateral / downward moves)
      - Domain-relevant years
      - Employment gaps > 12 months (flagged, not penalised)
    """
    # ── Resolve work history ───────────────────────────────────────────────────
    work_history: list[dict] = []
    total_yoe: Optional[float] = None
    jd_requirements: dict = {}

    if body.application_id is not None:
        # Fetch from CandidateProfile linked to this application
        profile = db.query(models.CandidateProfile).filter(
            models.CandidateProfile.application_id == body.application_id
        ).order_by(models.CandidateProfile.extracted_at.desc()).first()

        if profile and profile.work_history:
            try:
                work_history = json.loads(profile.work_history)
            except Exception:
                pass
            total_yoe = profile.total_yoe

    elif body.work_history is not None:
        work_history = body.work_history
        total_yoe = body.total_yoe

    else:
        raise HTTPException(
            status_code=422,
            detail="Provide either application_id or work_history.",
        )

    # ── Resolve JD requirements ────────────────────────────────────────────────
    if body.job_id is not None:
        job = db.query(models.Job).filter(models.Job.id == body.job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found.")
        if job.jd_parse_status != "done" or not job.jd_requirements:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"JD requirements not yet parsed for job {body.job_id}. "
                    "Trigger parsing via POST /api/jobs/{job_id}/parse-requirements."
                ),
            )
        try:
            jd_requirements = json.loads(job.jd_requirements)
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to parse JD requirements.")
    elif body.jd_data is not None:
        jd_requirements = body.jd_data
    else:
        raise HTTPException(
            status_code=422,
            detail="Provide either job_id or jd_data.",
        )

    # ── Compute score ──────────────────────────────────────────────────────────
    breakdown = score_experience(
        work_history=work_history,
        total_yoe=total_yoe,
        jd_requirements=jd_requirements,
    )
    return breakdown.to_dict()


@router.post("/education-score")
async def education_score(
    body: EducationScoreRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Compute the 0–20 education & certification sub-score for a candidate.

    Accepts either:
      - application_id + job_id  → fetches education/certifications from CandidateProfile
                                    and JD requirements from the Job row
      - education + certifications + jd_data  → direct input (for testing)

    The breakdown includes:
      - Degree level match (candidate's highest degree vs JD requirement)
      - Field of study relevance (semantic similarity, embedding-based)
      - Matched certifications and bonus score (capped at 3 pts)
    """
    # ── Resolve candidate education data ──────────────────────────────────────
    education_entries: list[dict] = []
    certifications: list[str] = []

    if body.application_id is not None:
        profile = (
            db.query(models.CandidateProfile)
            .filter(models.CandidateProfile.application_id == body.application_id)
            .order_by(models.CandidateProfile.extracted_at.desc())
            .first()
        )
        if profile:
            if profile.education:
                try:
                    education_entries = json.loads(profile.education)
                except Exception:
                    pass
            if profile.certifications:
                try:
                    certifications = json.loads(profile.certifications)
                except Exception:
                    pass

    elif body.education is not None or body.certifications is not None:
        education_entries = body.education or []
        certifications = body.certifications or []

    else:
        raise HTTPException(
            status_code=422,
            detail="Provide either application_id or education/certifications.",
        )

    # ── Resolve JD requirements ────────────────────────────────────────────────
    jd_requirements: dict = {}

    if body.job_id is not None:
        job = db.query(models.Job).filter(models.Job.id == body.job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found.")
        if job.jd_parse_status != "done" or not job.jd_requirements:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"JD requirements not yet parsed for job {body.job_id}. "
                    "Trigger parsing via POST /api/jobs/{job_id}/parse-requirements."
                ),
            )
        try:
            jd_requirements = json.loads(job.jd_requirements)
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to parse JD requirements.")

    elif body.jd_data is not None:
        jd_requirements = body.jd_data

    else:
        raise HTTPException(
            status_code=422,
            detail="Provide either job_id or jd_data.",
        )

    # ── Compute score ──────────────────────────────────────────────────────────
    try:
        breakdown = await score_education(
            education_entries=education_entries,
            certifications=certifications,
            jd_requirements=jd_requirements,
        )
    except Exception as exc:
        logger.error("Education scoring failed: %s", exc)
        raise HTTPException(status_code=503, detail=f"Education scoring service error: {exc}")

    return breakdown.to_dict()


@router.post("/projects-score")
async def projects_relevance_score(
    body: ProjectsScoreRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Compute the 0–20 project & portfolio relevance sub-score for a candidate.

    Accepts either:
      - application_id + job_id  → fetches projects from CandidateProfile and
                                    JD context from the Job row
      - projects + jd_title + jd_data  → direct input (for testing)

    Per project (max 5 evaluated):
      - Semantic relevance: cosine similarity of project text vs JD context (0–3 pts)
      - Complexity bonus: team size, scale, measurable impact, GitHub URL (0–1 pt)

    Total = sum of top-5 project scores, capped at 20.
    """
    # ── Resolve projects ───────────────────────────────────────────────────────
    projects: list[dict] = []

    if body.application_id is not None:
        profile = (
            db.query(models.CandidateProfile)
            .filter(models.CandidateProfile.application_id == body.application_id)
            .order_by(models.CandidateProfile.extracted_at.desc())
            .first()
        )
        if profile and profile.projects:
            try:
                projects = json.loads(profile.projects)
            except Exception:
                pass

    elif body.projects is not None:
        projects = body.projects

    else:
        raise HTTPException(
            status_code=422,
            detail="Provide either application_id or projects.",
        )

    # ── Resolve JD context ────────────────────────────────────────────────────
    jd_title: str = ""
    jd_requirements: dict = {}

    if body.job_id is not None:
        job = db.query(models.Job).filter(models.Job.id == body.job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found.")
        jd_title = job.title
        if job.jd_parse_status == "done" and job.jd_requirements:
            try:
                jd_requirements = json.loads(job.jd_requirements)
            except Exception:
                pass

    elif body.jd_title is not None or body.jd_data is not None:
        jd_title = body.jd_title or ""
        jd_requirements = body.jd_data or {}

    else:
        raise HTTPException(
            status_code=422,
            detail="Provide either job_id or jd_title/jd_data.",
        )

    # ── Compute score ──────────────────────────────────────────────────────────
    try:
        breakdown = await score_projects(
            projects=projects,
            jd_title=jd_title,
            jd_requirements=jd_requirements,
        )
    except Exception as exc:
        logger.error("Projects scoring failed: %s", exc)
        raise HTTPException(status_code=503, detail=f"Projects scoring service error: {exc}")

    return breakdown.to_dict()


@router.get("/cache-stats")
def cache_stats(
    _: models.User = Depends(require_recruiter),
):
    """
    Return embedding cache hit/miss statistics.
    Useful for monitoring whether the cache is effective and latency is on target.
    """
    try:
        stats = _embedder().cache_stats
    except Exception:
        return {"error": "Embedder not yet initialised (no calls made yet)."}
    return stats
