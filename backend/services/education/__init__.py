"""
services.education — Education & Certification Scoring (E5-S4)

Public API:

    from services.education import score_education, EducationScoreBreakdown

    breakdown = await score_education(
        education_entries=candidate_profile.education_parsed,
        certifications=candidate_profile.certifications_parsed,
        jd_requirements=jd_requirements_dict,
    )
    print(breakdown.score)        # 0–20
    print(breakdown.to_dict())    # full serialisable breakdown

Module-level singletons are stateless and safe to share across requests.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Optional

from services.education.certifications import CertificationScorer
from services.education.degree import DegreeClassifier
from services.education.models import EducationScoreBreakdown
from services.education.scorer import EducationScorer


# ── Singletons ────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _degree_classifier() -> DegreeClassifier:
    return DegreeClassifier()


@lru_cache(maxsize=1)
def _cert_scorer() -> CertificationScorer:
    return CertificationScorer()


@lru_cache(maxsize=1)
def _scorer() -> EducationScorer:
    return EducationScorer(
        degree_classifier=_degree_classifier(),
        cert_scorer=_cert_scorer(),
    )


# ── High-level entry point ────────────────────────────────────────────────────

async def score_education(
    education_entries: list[dict],
    certifications: list[str],
    jd_requirements: dict,
) -> EducationScoreBreakdown:
    """
    Compute the 0–20 education & certification sub-score for one candidate.

    education_entries  — list of EducationEntry dicts from CandidateProfile
                         (each has: degree, institution, year)
    certifications     — list of certification strings from CandidateProfile
    jd_requirements    — parsed JDRequirements dict (from Job.jd_requirements JSON)
                         Uses: education_level, education_field, required_skill_groups,
                               job_function

    Async — field-of-study similarity requires an embedding call.
    """
    # Flatten required skills for certification keyword matching
    skill_list: list[str] = []
    for group in jd_requirements.get("required_skill_groups", []):
        skill_list.extend(group.get("skills", []))
    skill_list.extend(jd_requirements.get("preferred_skills", []))

    return await _scorer().compute(
        education_entries=education_entries,
        certifications=certifications,
        jd_education_level=jd_requirements.get("education_level"),
        jd_education_field=jd_requirements.get("education_field"),
        jd_skill_list=skill_list if skill_list else None,
        jd_job_function=jd_requirements.get("job_function"),
    )


# ── Re-exports ────────────────────────────────────────────────────────────────

__all__ = [
    "score_education",
    "EducationScoreBreakdown",
]
