"""
ExperienceScorer — translates an AnalysisResult + JD requirements into a 0–30 sub-score.

Single responsibility: scoring math only.  All parsing and analysis lives in analyzer.py.

Sub-score breakdown (max 30 pts):
  ┌────────────────────────────────┬──────────┐
  │ Component                      │ Max pts  │
  ├────────────────────────────────┼──────────┤
  │ Total YoE vs JD requirement    │  12      │
  │ Seniority match                │  10      │
  │ Career progression             │   5      │
  │ Domain relevance               │   3      │
  └────────────────────────────────┴──────────┘

Employment gaps > 12 months are flagged in the breakdown but do NOT deduct
from the score — per spec "do not hard-penalise score".
"""

from __future__ import annotations

from typing import Optional

from services.experience.models import AnalysisResult, ExperienceScoreBreakdown
from services.experience.seniority import SeniorityClassifier

# ── Component maximums ─────────────────────────────────────────────────────────
_MAX_YOE = 12.0
_MAX_SENIORITY = 10.0
_MAX_PROGRESSION = 5.0
_MAX_DOMAIN = 3.0
_MAX_TOTAL = _MAX_YOE + _MAX_SENIORITY + _MAX_PROGRESSION + _MAX_DOMAIN  # 30.0


class ExperienceScorer:
    """
    Stateless scorer — safe to use as a module-level singleton.

    compute() is the single public method; it takes the output of
    WorkHistoryAnalyzer plus the JD requirement fields and returns
    an ExperienceScoreBreakdown.
    """

    def __init__(self, classifier: SeniorityClassifier | None = None) -> None:
        self._clf = classifier or SeniorityClassifier()

    # ── Public ────────────────────────────────────────────────────────────────

    def compute(
        self,
        analysis: AnalysisResult,
        total_yoe_override: Optional[float],      # from CandidateProfile.total_yoe (AI-extracted)
        jd_min_years: Optional[int],
        jd_max_years: Optional[int],
        jd_seniority: Optional[str],
        jd_job_function: Optional[str],
    ) -> ExperienceScoreBreakdown:
        """
        Compute the 0–30 experience sub-score.

        total_yoe_override is the AI-extracted value from CandidateProfile.
        When available it takes precedence over computed_yoe from work_history
        (AI reads the full resume and is more accurate about overlapping roles,
        part-time work, internships, etc.).
        """
        effective_yoe = self._effective_yoe(total_yoe_override, analysis.computed_yoe)

        yoe_score, yoe_ratio = self._score_yoe(effective_yoe, jd_min_years)
        seniority_score, level_gap = self._score_seniority(
            analysis.candidate_seniority_level, jd_seniority
        )
        progression_score = self._score_progression(analysis.progression_signals)
        domain_score = self._score_domain(analysis.domain_relevance_ratio, jd_job_function)

        total = min(_MAX_TOTAL, yoe_score + seniority_score + progression_score + domain_score)

        note = self._build_note(
            effective_yoe, jd_min_years,
            analysis.candidate_seniority_label, jd_seniority,
            analysis.parseable_roles, len(analysis.employment_gaps),
        )

        return ExperienceScoreBreakdown(
            score=round(total, 2),
            max_score=_MAX_TOTAL,
            yoe_score=round(yoe_score, 2),
            seniority_score=round(seniority_score, 2),
            progression_score=round(progression_score, 2),
            domain_score=round(domain_score, 2),
            candidate_total_yoe=effective_yoe,
            required_yoe=jd_min_years,
            yoe_ratio=round(yoe_ratio, 3) if yoe_ratio is not None else None,
            candidate_seniority=analysis.candidate_seniority_label,
            jd_seniority=jd_seniority,
            seniority_level_gap=level_gap,
            employment_gaps=analysis.employment_gaps,
            progression_signals=analysis.progression_signals,
            domain_relevant_years=analysis.domain_relevant_years,
            domain_relevance_ratio=analysis.domain_relevance_ratio,
            parseable_roles=analysis.parseable_roles,
            note=note,
        )

    # ── Sub-scorers ───────────────────────────────────────────────────────────

    @staticmethod
    def _effective_yoe(
        ai_yoe: Optional[float], computed_yoe: float
    ) -> Optional[float]:
        """
        Prefer the AI-extracted total_yoe when available.
        Fall back to the computed value from work history dates.
        Returns None when neither is available.
        """
        if ai_yoe is not None and ai_yoe > 0:
            return ai_yoe
        if computed_yoe > 0:
            return computed_yoe
        return None

    def _score_yoe(
        self, yoe: Optional[float], required: Optional[int]
    ) -> tuple[float, Optional[float]]:
        """
        Score: 0–12 pts.
        If no YoE requirement in JD → full marks (no gate to clear).
        If YoE unknown → 0 pts (conservative — scorer has no evidence).
        """
        if required is None or required == 0:
            return _MAX_YOE, None   # no requirement → full marks

        if yoe is None:
            return 0.0, None        # unknown YoE → conservative zero

        ratio = yoe / required

        if ratio >= 1.0:
            score = _MAX_YOE            # meets or exceeds requirement
        elif ratio >= 0.85:
            score = _MAX_YOE * 0.87     # ≈ 10.4 pts — close enough
        elif ratio >= 0.70:
            score = _MAX_YOE * 0.70     # ≈ 8.4 pts
        elif ratio >= 0.50:
            score = _MAX_YOE * 0.50     # 6 pts
        elif ratio >= 0.30:
            score = _MAX_YOE * 0.25     # 3 pts
        else:
            score = 0.0                 # severely under-experienced

        return score, min(ratio, 1.5)   # cap reported ratio at 1.5× for clarity

    def _score_seniority(
        self, candidate_level: int, jd_seniority: Optional[str]
    ) -> tuple[float, int]:
        """
        Score: 0–10 pts.
        If JD seniority unknown → full marks (no stated preference).
        Exact match → 10 pts.
        Over-qualified by 1 level → 9 pts (slightly less than exact — over-levelled candidates
        may leave quickly or expect too high comp).
        Under-qualified decreases faster.

        Returns (score, level_gap).
        """
        jd_level = self._clf.from_jd_string(jd_seniority)

        if jd_level == 0 or candidate_level == 0:
            return _MAX_SENIORITY, 0   # unknown on either side → full marks

        gap = self._clf.seniority_gap(candidate_level, jd_level)

        score_table = {
            3:  2.0,    # 3 levels over-qualified
            2:  5.0,    # 2 levels over-qualified
            1:  9.0,    # 1 level over-qualified (minor concern)
            0:  10.0,   # exact match
            -1: 7.0,    # 1 level under — may still succeed
            -2: 3.0,    # 2 levels under — significant gap
            -3: 0.5,    # 3 levels under — very unlikely fit
        }
        score = score_table.get(gap, 0.0 if gap < -3 else 1.0)
        return score, gap

    @staticmethod
    def _score_progression(signals: list) -> float:
        """
        Score: 0–5 pts.
        Upward moves (increasing seniority) are weighted positively.
        Lateral moves are neutral — may indicate breadth.
        Downward moves reduce the score slightly.

        Formula:
          upward_bonus = (upward / total) * MAX
          lateral_neutral = no change
          downward_penalty = small deduction per downward move (capped)
        """
        if not signals:
            return _MAX_PROGRESSION * 0.6   # no move data → neutral (3 pts)

        upward = sum(1 for s in signals if s.direction == "upward")
        downward = sum(1 for s in signals if s.direction == "downward")
        total = len(signals)

        progression_ratio = upward / total
        downward_ratio = downward / total

        # Base score from upward moves
        score = progression_ratio * _MAX_PROGRESSION

        # Small deduction for downward moves (max 1.5 pts off)
        penalty = min(1.5, downward_ratio * 2.0)
        score = max(0.0, score - penalty)

        return score

    @staticmethod
    def _score_domain(relevance_ratio: float, job_function: Optional[str]) -> float:
        """
        Score: 0–3 pts.
        If no job_function in JD → full marks.
        Otherwise proportional to domain_relevance_ratio.
        """
        if not job_function:
            return _MAX_DOMAIN   # no stated function → full marks

        return relevance_ratio * _MAX_DOMAIN

    # ── Note builder ──────────────────────────────────────────────────────────

    @staticmethod
    def _build_note(
        yoe: Optional[float],
        required: Optional[int],
        cand_seniority: str,
        jd_seniority: Optional[str],
        parseable_roles: int,
        gap_count: int,
    ) -> str:
        parts = []

        if parseable_roles == 0:
            parts.append(
                "Work history dates could not be parsed — progression and gap analysis skipped."
            )

        if yoe is not None and required and yoe < required * 0.5:
            parts.append(
                f"Candidate has {yoe:.1f} yrs vs {required} required "
                f"({yoe / required * 100:.0f}% of requirement)."
            )

        if jd_seniority and cand_seniority != "Unknown" and cand_seniority != jd_seniority:
            parts.append(
                f"Seniority mismatch: JD expects {jd_seniority}, "
                f"candidate's most recent title maps to {cand_seniority}."
            )

        if gap_count > 0:
            parts.append(
                f"{gap_count} employment gap(s) > 12 months detected (not penalised)."
            )

        return " ".join(parts)
