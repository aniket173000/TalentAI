"""
Project relevance scoring data models — E5-S5.

Single responsibility: data containers only.  No scoring logic lives here.

Score breakdown (max 20 pts):
  Up to 5 projects evaluated, each scored 0–4 pts:
  ┌────────────────────────────────────┬────────────┐
  │ Component (per project)            │ Max pts    │
  ├────────────────────────────────────┼────────────┤
  │ Semantic relevance to JD           │ 3.0        │
  │ Complexity bonus (4 signals ×0.25) │ 1.0        │
  └────────────────────────────────────┴────────────┘
  Total: sum of top-5 project scores, capped at 20.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class ComplexitySignals:
    """Which complexity indicators were detected in a project."""
    team_size: bool = False         # "team of 5", "led 3 engineers"
    scale: bool = False             # "1M users", "10 TB data"
    measurable_impact: bool = False # "50% faster", "$2M saved"
    github_or_oss: bool = False     # github.com URL or "open-source" mention

    @property
    def score(self) -> float:
        return sum(0.25 for flag in (
            self.team_size, self.scale,
            self.measurable_impact, self.github_or_oss
        ) if flag)

    def to_dict(self) -> dict:
        return {
            "team_size": self.team_size,
            "scale": self.scale,
            "measurable_impact": self.measurable_impact,
            "github_or_oss": self.github_or_oss,
            "complexity_score": self.score,
        }


@dataclass
class ProjectResult:
    """Score result for a single project."""
    name: str
    description: str
    technologies: list[str]
    url: Optional[str]

    relevance_score: float = 0.0      # 0–3 pts
    complexity_score: float = 0.0     # 0–1 pt
    combined_score: float = 0.0       # 0–4 pts
    similarity: Optional[float] = None  # raw cosine similarity

    complexity_signals: ComplexitySignals = field(default_factory=ComplexitySignals)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "combined_score": round(self.combined_score, 3),
            "relevance_score": round(self.relevance_score, 3),
            "complexity_score": round(self.complexity_score, 3),
            "similarity": round(self.similarity, 3) if self.similarity is not None else None,
            "complexity_signals": self.complexity_signals.to_dict(),
            "technologies": self.technologies,
            "url": self.url,
        }


@dataclass
class ProjectScoreBreakdown:
    """Full serialisable output from ProjectScorer.compute()."""

    score: float = 0.0
    max_score: float = 20.0
    projects_evaluated: int = 0
    projects_total: int = 0
    jd_context_used: str = ""
    project_results: list[ProjectResult] = field(default_factory=list)
    note: str = ""

    def to_dict(self) -> dict:
        return {
            "score": self.score,
            "max_score": self.max_score,
            "projects_evaluated": self.projects_evaluated,
            "projects_total": self.projects_total,
            "jd_context_used": self.jd_context_used,
            "project_results": [p.to_dict() for p in self.project_results],
            "note": self.note,
        }
