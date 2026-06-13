"""
Composite score data models — E5-S6.

Composite = Skills(30) + Experience(30) + Education(20) + Projects(20) = max 100.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

SCORING_MODEL_VERSION = "1.0"


@dataclass
class CompositeScoreResult:
    """
    Full composite score with sub-score breakdowns.

    This is the in-memory representation; the DB row is CandidateJobScore.
    """
    # Totals
    composite_score: float = 0.0
    max_composite: float = 100.0

    # Sub-scores
    skills_score: float = 0.0       # 0–30
    experience_score: float = 0.0   # 0–30
    education_score: float = 0.0    # 0–20
    projects_score: float = 0.0     # 0–20

    # Full breakdowns (serialisable dicts)
    skills_breakdown: dict = field(default_factory=dict)
    experience_breakdown: dict = field(default_factory=dict)
    education_breakdown: dict = field(default_factory=dict)
    projects_breakdown: dict = field(default_factory=dict)

    # Metadata
    model_version: str = SCORING_MODEL_VERSION
    inputs_hash: str = ""
    candidate_profile_id: Optional[int] = None
    application_id: Optional[int] = None
    job_id: Optional[int] = None
    from_cache: bool = False    # True = returned from existing DB record

    note: str = ""

    def to_dict(self) -> dict:
        return {
            "composite_score": self.composite_score,
            "max_composite": self.max_composite,
            "from_cache": self.from_cache,
            "model_version": self.model_version,
            "sub_scores": {
                "skills": {
                    "score": self.skills_score,
                    "max": 30.0,
                    "breakdown": self.skills_breakdown,
                },
                "experience": {
                    "score": self.experience_score,
                    "max": 30.0,
                    "breakdown": self.experience_breakdown,
                },
                "education": {
                    "score": self.education_score,
                    "max": 20.0,
                    "breakdown": self.education_breakdown,
                },
                "projects": {
                    "score": self.projects_score,
                    "max": 20.0,
                    "breakdown": self.projects_breakdown,
                },
            },
            "note": self.note,
        }
