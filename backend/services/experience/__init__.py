"""
services.experience — Experience Depth Scoring (E5-S3)

Public API:

    from services.experience import score_experience, ExperienceScoreBreakdown

    breakdown = score_experience(
        work_history=candidate_profile.work_history_parsed,
        total_yoe=candidate_profile.total_yoe,
        jd_requirements=jd_requirements_dict,
    )
    print(breakdown.score)        # 0–30
    print(breakdown.to_dict())    # full serialisable breakdown

Module-level singletons are stateless and safe to share across requests.
"""

from functools import lru_cache
from typing import Optional

from services.experience.analyzer import WorkHistoryAnalyzer
from services.experience.models import ExperienceScoreBreakdown
from services.experience.scorer import ExperienceScorer
from services.experience.seniority import SeniorityClassifier


# ── Singletons ────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _classifier() -> SeniorityClassifier:
    return SeniorityClassifier()


@lru_cache(maxsize=1)
def _analyzer() -> WorkHistoryAnalyzer:
    return WorkHistoryAnalyzer(classifier=_classifier())


@lru_cache(maxsize=1)
def _scorer() -> ExperienceScorer:
    return ExperienceScorer(classifier=_classifier())


# ── High-level entry point ────────────────────────────────────────────────────

def score_experience(
    work_history: list[dict],
    total_yoe: Optional[float],
    jd_requirements: dict,
) -> ExperienceScoreBreakdown:
    """
    Compute the 0–30 experience depth sub-score for one candidate.

    work_history    — list of work_history dicts from CandidateProfile
                      (each has: company, title, start_date, end_date, description)
    total_yoe       — AI-extracted total years from CandidateProfile.total_yoe
                      (None if not yet extracted)
    jd_requirements — parsed JDRequirements dict (from Job.jd_requirements JSON)
                      Uses: min_years_experience, seniority, job_function

    Synchronous — no network I/O, safe to call in any context.
    """
    job_function: Optional[str] = jd_requirements.get("job_function")

    analysis = _analyzer().analyze(work_history, job_function=job_function)

    return _scorer().compute(
        analysis=analysis,
        total_yoe_override=total_yoe,
        jd_min_years=jd_requirements.get("min_years_experience"),
        jd_max_years=jd_requirements.get("max_years_experience"),
        jd_seniority=jd_requirements.get("seniority"),
        jd_job_function=job_function,
    )


# ── Re-exports ────────────────────────────────────────────────────────────────

__all__ = [
    "score_experience",
    "ExperienceScoreBreakdown",
]
