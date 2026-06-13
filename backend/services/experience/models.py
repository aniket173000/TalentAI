"""
Domain models for experience depth scoring.

Pure dataclasses — no framework dependencies, no I/O.
Produced by WorkHistoryAnalyzer, consumed by ExperienceScorer and the API layer.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Optional


@dataclass
class WorkPeriod:
    """
    A single employment period with parsed (not raw string) dates.
    Produced by WorkHistoryAnalyzer from a work_history dict entry.
    """
    company: str
    title: str
    start: date
    end: date          # today when end_date is "Present"
    duration_years: float


@dataclass(frozen=True)
class GapFlag:
    """
    An employment gap exceeding the configured threshold.
    Flagged in the breakdown but does NOT deduct from the score (per spec).
    """
    gap_start: date
    gap_end: date
    duration_months: float
    after_company: str     # most recent role before the gap
    before_company: str    # first role after the gap


@dataclass(frozen=True)
class ProgressionSignal:
    """
    One career move: from a previous title to the next chronological title.
    direction is "upward", "lateral", or "downward" relative to seniority level.
    """
    from_title: str
    to_title: str
    from_level: int    # numeric seniority level (1=Junior … 6=Executive)
    to_level: int
    direction: str     # "upward" | "lateral" | "downward"


@dataclass
class AnalysisResult:
    """
    Intermediate output of WorkHistoryAnalyzer — consumed only by ExperienceScorer.
    Separates analysis (pure parsing) from scoring (pure math).
    """
    # Parsed timeline
    periods: list[WorkPeriod] = field(default_factory=list)
    computed_yoe: float = 0.0          # computed from merged, non-overlapping periods
    parseable_roles: int = 0           # roles that had parseable start/end dates

    # Gap analysis
    employment_gaps: list[GapFlag] = field(default_factory=list)

    # Progression analysis
    progression_signals: list[ProgressionSignal] = field(default_factory=list)
    candidate_seniority_level: int = 0         # inferred from most recent title
    candidate_seniority_label: str = "Unknown"

    # Domain relevance
    domain_relevant_years: float = 0.0
    total_dated_years: float = 0.0
    domain_relevance_ratio: float = 0.0        # 0.0–1.0


@dataclass
class ExperienceScoreBreakdown:
    """
    Final output of ExperienceScorer.

    score (0–30) breaks down into four components.
    Employment gaps are surfaced as flags — per spec they do not reduce the score.
    """
    # Total
    score: float
    max_score: float   # always 30.0

    # Sub-components
    yoe_score: float           # 0–12  total years of experience vs JD requirement
    seniority_score: float     # 0–10  JD seniority vs candidate's last title seniority
    progression_score: float   # 0–5   upward career trajectory bonus
    domain_score: float        # 0–3   relevant-domain years / total years

    # Context
    candidate_total_yoe: Optional[float]
    required_yoe: Optional[int]
    yoe_ratio: Optional[float]            # candidate_yoe / required_yoe, capped at 1.0

    candidate_seniority: str              # e.g. "Senior"
    jd_seniority: Optional[str]
    seniority_level_gap: int              # positive = over-qualified, negative = under-qualified

    # Flags (no score impact)
    employment_gaps: list[GapFlag]
    progression_signals: list[ProgressionSignal]

    # Domain
    domain_relevant_years: float
    domain_relevance_ratio: float         # 0.0–1.0

    # Meta
    parseable_roles: int
    note: str = ""     # human-readable explanation for edge cases

    def to_dict(self) -> dict:
        def _gap(g: GapFlag) -> dict:
            return {
                "gap_start": g.gap_start.isoformat(),
                "gap_end": g.gap_end.isoformat(),
                "duration_months": round(g.duration_months, 1),
                "after_company": g.after_company,
                "before_company": g.before_company,
            }

        def _signal(s: ProgressionSignal) -> dict:
            return {
                "from_title": s.from_title,
                "to_title": s.to_title,
                "from_level": s.from_level,
                "to_level": s.to_level,
                "direction": s.direction,
            }

        return {
            "score": round(self.score, 2),
            "max_score": self.max_score,
            "sub_scores": {
                "yoe": round(self.yoe_score, 2),
                "seniority": round(self.seniority_score, 2),
                "progression": round(self.progression_score, 2),
                "domain": round(self.domain_score, 2),
            },
            "experience": {
                "candidate_total_yoe": self.candidate_total_yoe,
                "required_yoe": self.required_yoe,
                "yoe_ratio": round(self.yoe_ratio, 3) if self.yoe_ratio is not None else None,
            },
            "seniority": {
                "candidate": self.candidate_seniority,
                "jd": self.jd_seniority,
                "level_gap": self.seniority_level_gap,
            },
            "domain": {
                "relevant_years": round(self.domain_relevant_years, 1),
                "relevance_ratio": round(self.domain_relevance_ratio, 3),
            },
            "flags": {
                "employment_gaps": [_gap(g) for g in self.employment_gaps],
                "gap_count": len(self.employment_gaps),
            },
            "progression_signals": [_signal(s) for s in self.progression_signals],
            "parseable_roles": self.parseable_roles,
            "note": self.note,
        }
