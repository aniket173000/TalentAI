"""
Education scoring data models — E5-S4.

Single responsibility: data containers only.  No scoring logic lives here.

Score breakdown (max 20 pts):
  ┌──────────────────────────────────┬──────────┐
  │ Component                        │ Max pts  │
  ├──────────────────────────────────┼──────────┤
  │ Degree level match               │  12      │
  │ Field of study relevance         │   5      │
  │ Certifications bonus             │   3      │
  └──────────────────────────────────┴──────────┘
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum
from typing import Optional


class DegreeLevel(IntEnum):
    NONE = 0
    DIPLOMA = 1
    BACHELOR = 2
    MASTER = 3
    PHD = 4

    @classmethod
    def label(cls, level: int) -> str:
        _LABELS = {0: "None", 1: "Diploma", 2: "Bachelor", 3: "Master", 4: "PhD"}
        return _LABELS.get(level, "Unknown")


@dataclass(frozen=True)
class CertificationMatch:
    """A candidate certification that matched a JD keyword."""
    certification: str
    matched_keyword: str
    relevance_score: float   # 0.0–1.0; currently 1.0 for any keyword hit


@dataclass
class EducationScoreBreakdown:
    """Full serialisable output from EducationScorer.compute()."""

    score: float = 0.0
    max_score: float = 20.0

    # Component scores
    degree_score: float = 0.0          # 0–12
    field_score: float = 0.0           # 0–5
    certification_score: float = 0.0   # 0–3

    # Degree detail
    candidate_degree_level: int = 0          # DegreeLevel ordinal
    candidate_degree_label: str = "None"
    candidate_degree_string: str = ""        # raw string from EducationEntry
    candidate_field: Optional[str] = None   # extracted field of study
    required_degree_level: int = 0
    required_degree_label: str = "None"
    degree_level_gap: int = 0               # negative = under-qualified

    # Field of study detail
    jd_education_field: Optional[str] = None
    field_similarity: Optional[float] = None   # cosine similarity 0–1

    # Certifications
    matched_certifications: list[CertificationMatch] = field(default_factory=list)
    unmatched_certifications: list[str] = field(default_factory=list)

    note: str = ""

    def to_dict(self) -> dict:
        return {
            "score": self.score,
            "max_score": self.max_score,
            "breakdown": {
                "degree": {
                    "score": self.degree_score,
                    "max": 12.0,
                    "candidate_level": self.candidate_degree_label,
                    "required_level": self.required_degree_label,
                    "level_gap": self.degree_level_gap,
                    "candidate_degree_string": self.candidate_degree_string,
                    "candidate_field": self.candidate_field,
                },
                "field_of_study": {
                    "score": self.field_score,
                    "max": 5.0,
                    "jd_field": self.jd_education_field,
                    "similarity": self.field_similarity,
                },
                "certifications": {
                    "score": self.certification_score,
                    "max": 3.0,
                    "matched": [
                        {
                            "certification": m.certification,
                            "matched_keyword": m.matched_keyword,
                            "relevance": m.relevance_score,
                        }
                        for m in self.matched_certifications
                    ],
                    "unmatched": self.unmatched_certifications,
                },
            },
            "note": self.note,
        }
