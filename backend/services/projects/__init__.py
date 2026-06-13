"""
services.projects — Project & Portfolio Relevance Scoring (E5-S5)

Public API:

    from services.projects import score_projects, ProjectScoreBreakdown

    breakdown = await score_projects(
        projects=candidate_profile.projects_parsed,
        jd_title="Senior Backend Engineer",
        jd_requirements=jd_requirements_dict,
    )
    print(breakdown.score)        # 0–20
    print(breakdown.to_dict())    # full serialisable breakdown

Module-level singletons are stateless and safe to share across requests.
"""

from __future__ import annotations

from functools import lru_cache

from services.projects.complexity import ComplexityAnalyzer
from services.projects.models import ProjectScoreBreakdown
from services.projects.scorer import ProjectScorer


# ── Singletons ────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _complexity_analyzer() -> ComplexityAnalyzer:
    return ComplexityAnalyzer()


@lru_cache(maxsize=1)
def _scorer() -> ProjectScorer:
    return ProjectScorer(complexity_analyzer=_complexity_analyzer())


# ── High-level entry point ────────────────────────────────────────────────────

async def score_projects(
    projects: list[dict],
    jd_title: str,
    jd_requirements: dict,
) -> ProjectScoreBreakdown:
    """
    Compute the 0–20 project relevance sub-score for one candidate.

    projects         — list of ProjectEntry dicts from CandidateProfile
                       (each has: name, description, technologies, url?)
    jd_title         — job title string for embedding context
    jd_requirements  — parsed JDRequirements dict (from Job.jd_requirements JSON)
                       Uses: job_function, required_skill_groups, preferred_skills,
                             key_responsibilities

    Async — semantic relevance requires an embedding call.
    Max 5 projects evaluated; additional projects ignored.
    """
    return await _scorer().compute(
        projects=projects,
        jd_title=jd_title,
        jd_requirements=jd_requirements,
    )


# ── Re-exports ────────────────────────────────────────────────────────────────

__all__ = [
    "score_projects",
    "ProjectScoreBreakdown",
]
