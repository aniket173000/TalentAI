"""
WorkHistoryAnalyzer — parses and analyzes a candidate's work history.

Single responsibility: transform raw work_history dicts into a structured
AnalysisResult.  No scoring math lives here.

Handles:
  - Robust date parsing for all common resume date formats
  - Merging overlapping employment periods for accurate total YoE
  - Detecting employment gaps > GAP_THRESHOLD_MONTHS
  - Career progression signals (upward / lateral / downward moves)
  - Domain-relevance estimation via job-function keyword matching
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Optional

from services.experience.models import (
    AnalysisResult,
    GapFlag,
    ProgressionSignal,
    WorkPeriod,
)
from services.experience.seniority import SeniorityClassifier

# Gaps longer than this are flagged (no score impact per spec)
GAP_THRESHOLD_MONTHS = 12

# Job-function keyword groups for domain relevance
_FUNCTION_KEYWORDS: dict[str, set[str]] = {
    "engineering": {
        "engineer", "developer", "programmer", "architect", "devops", "sre",
        "platform", "backend", "frontend", "fullstack", "full-stack", "software",
    },
    "data": {
        "data", "analyst", "analytics", "scientist", "ml", "ai",
        "machine learning", "mlops", "bi", "business intelligence",
        "etl", "pipeline", "database", "dba",
    },
    "product": {"product", "pm", "product manager", "product owner"},
    "design": {"design", "ux", "ui", "user experience", "creative", "visual"},
    "marketing": {"marketing", "growth", "seo", "content", "brand", "digital"},
    "sales": {"sales", "account executive", "business development", "bd"},
    "operations": {"operations", "ops", "logistics", "supply chain"},
    "finance": {"finance", "financial", "accounting", "controller", "treasurer"},
    "hr": {"hr", "human resources", "recruiting", "talent acquisition", "people ops"},
}

_MONTH_MAP: dict[str, int] = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    "january": 1, "february": 2, "march": 3, "april": 4,
    "june": 6, "july": 7, "august": 8, "september": 9,
    "october": 10, "november": 11, "december": 12,
}


class WorkHistoryAnalyzer:
    """
    Stateless analyzer.  Instantiate once as a module-level singleton.

    Usage:
        result = analyzer.analyze(work_history, job_function="Engineering")
    """

    def __init__(
        self,
        gap_threshold_months: int = GAP_THRESHOLD_MONTHS,
        classifier: SeniorityClassifier | None = None,
    ) -> None:
        self._gap_months = gap_threshold_months
        self._clf = classifier or SeniorityClassifier()

    # ── Public entry point ────────────────────────────────────────────────────

    def analyze(
        self,
        work_history: list[dict],
        job_function: Optional[str] = None,
    ) -> AnalysisResult:
        """
        Full analysis pipeline:
          1. Parse raw work_history dicts into WorkPeriods
          2. Compute total YoE from merged non-overlapping periods
          3. Detect employment gaps
          4. Analyze career progression
          5. Estimate domain-relevant years
        """
        if not work_history:
            return AnalysisResult()

        # Step 1 — parse dates
        periods = self._parse_periods(work_history)
        parseable = len(periods)

        if not periods:
            # No parseable dates → return minimal result (YoE from CandidateProfile used instead)
            return AnalysisResult(
                parseable_roles=0,
                candidate_seniority_level=self._clf.from_title(
                    work_history[0].get("title", "") if work_history else ""
                ),
                candidate_seniority_label=self._clf.label(
                    self._clf.from_title(
                        work_history[0].get("title", "") if work_history else ""
                    )
                ),
            )

        # Step 2 — YoE from merged periods
        sorted_periods = sorted(periods, key=lambda p: p.start)
        merged = self._merge_periods(sorted_periods)
        computed_yoe = sum(p.duration_years for p in merged)

        # Step 3 — gaps
        gaps = self._find_gaps(sorted_periods)

        # Step 4 — progression (requires original order, not merged)
        signals = self._analyze_progression(sorted_periods)

        # Step 5 — domain relevance
        domain_relevant_years, total_dated_years = self._domain_years(
            sorted_periods, job_function
        )
        domain_ratio = (
            domain_relevant_years / total_dated_years
            if total_dated_years > 0
            else 1.0   # no dated history → assume all relevant
        )

        # Seniority from most-recent role title
        most_recent = sorted_periods[-1]
        cand_level = self._clf.from_title(most_recent.title)
        cand_label = self._clf.label(cand_level)

        return AnalysisResult(
            periods=sorted_periods,
            computed_yoe=round(computed_yoe, 2),
            parseable_roles=parseable,
            employment_gaps=gaps,
            progression_signals=signals,
            candidate_seniority_level=cand_level,
            candidate_seniority_label=cand_label,
            domain_relevant_years=round(domain_relevant_years, 2),
            total_dated_years=round(total_dated_years, 2),
            domain_relevance_ratio=round(domain_ratio, 3),
        )

    # ── Date parsing ──────────────────────────────────────────────────────────

    def _parse_periods(self, work_history: list[dict]) -> list[WorkPeriod]:
        periods = []
        for entry in work_history:
            start = self._parse_date(entry.get("start_date"))
            if start is None:
                continue  # can't place this role on the timeline

            end_raw = entry.get("end_date") or ""
            end = self._parse_date(end_raw)
            if end is None:
                # Unknown end — assume still employed (treat as present)
                end = date.today()

            if end < start:
                # Data quality issue — skip
                continue

            days = (end - start).days
            duration_years = days / 365.25

            periods.append(WorkPeriod(
                company=entry.get("company", "Unknown"),
                title=entry.get("title", ""),
                start=start,
                end=end,
                duration_years=round(duration_years, 2),
            ))
        return periods

    @staticmethod
    def _parse_date(raw: str | None) -> date | None:
        """
        Parse a resume date string into a date object.
        Handles: "Jan 2021", "January 2021", "2021-01", "2021", "Present", etc.
        Returns None for unparseable input.
        """
        if not raw:
            return None

        s = raw.strip().lower()

        if s in ("present", "current", "now", "today", "ongoing", "-", "–", "—"):
            return date.today()

        # "Jan 2021" / "January 2021"
        m = re.match(r"([a-z]+)\.?\s+(\d{4})", s)
        if m:
            month = _MONTH_MAP.get(m.group(1).rstrip("."))
            if month:
                return date(int(m.group(2)), month, 1)

        # "2021-01" / "2021/01" / "2021.01"
        m = re.match(r"(\d{4})[-/.]+(\d{1,2})$", s)
        if m:
            year, month = int(m.group(1)), int(m.group(2))
            if 1 <= month <= 12:
                return date(year, month, 1)

        # "01/2021" / "1/2021"
        m = re.match(r"(\d{1,2})[/](\d{4})$", s)
        if m:
            month, year = int(m.group(1)), int(m.group(2))
            if 1 <= month <= 12:
                return date(year, month, 1)

        # "Q1 2021", "Q3/2022"
        m = re.match(r"q([1-4])\s*[/.-]?\s*(\d{4})", s)
        if m:
            quarter_month = (int(m.group(1)) - 1) * 3 + 1
            return date(int(m.group(2)), quarter_month, 1)

        # "2021" — year only
        m = re.match(r"^(\d{4})$", s)
        if m:
            return date(int(m.group(1)), 1, 1)

        return None

    # ── Period merging ────────────────────────────────────────────────────────

    @staticmethod
    def _merge_periods(sorted_periods: list[WorkPeriod]) -> list[WorkPeriod]:
        """
        Merge overlapping or adjacent employment periods so that concurrent
        roles (common in consulting / contracting) are not double-counted.
        """
        if not sorted_periods:
            return []

        merged: list[tuple[date, date]] = [(sorted_periods[0].start, sorted_periods[0].end)]

        for p in sorted_periods[1:]:
            last_start, last_end = merged[-1]
            if p.start <= last_end + timedelta(days=31):  # ≤1 month gap = adjacent
                merged[-1] = (last_start, max(last_end, p.end))
            else:
                merged.append((p.start, p.end))

        return [
            WorkPeriod(
                company="",
                title="",
                start=s,
                end=e,
                duration_years=(e - s).days / 365.25,
            )
            for s, e in merged
        ]

    # ── Gap detection ─────────────────────────────────────────────────────────

    def _find_gaps(self, sorted_periods: list[WorkPeriod]) -> list[GapFlag]:
        gaps: list[GapFlag] = []
        today = date.today()

        for i in range(len(sorted_periods) - 1):
            current = sorted_periods[i]
            nxt = sorted_periods[i + 1]

            gap_start = current.end
            gap_end = nxt.start

            if gap_end <= gap_start:
                continue  # overlapping roles, no gap

            gap_days = (gap_end - gap_start).days
            gap_months = gap_days / 30.44

            # Skip gaps that extend beyond today (future start dates)
            if gap_start > today:
                continue

            if gap_months > self._gap_months:
                gaps.append(GapFlag(
                    gap_start=gap_start,
                    gap_end=gap_end,
                    duration_months=round(gap_months, 1),
                    after_company=current.company,
                    before_company=nxt.company,
                ))

        return gaps

    # ── Progression analysis ──────────────────────────────────────────────────

    def _analyze_progression(
        self, sorted_periods: list[WorkPeriod]
    ) -> list[ProgressionSignal]:
        """
        Compare consecutive roles to detect upward / lateral / downward moves.
        Progression is evaluated chronologically (oldest → newest).
        """
        signals: list[ProgressionSignal] = []

        for i in range(len(sorted_periods) - 1):
            prev = sorted_periods[i]
            curr = sorted_periods[i + 1]

            prev_level = self._clf.from_title(prev.title)
            curr_level = self._clf.from_title(curr.title)

            if prev_level == 0 or curr_level == 0:
                continue  # can't classify one of the titles

            if curr_level > prev_level:
                direction = "upward"
            elif curr_level == prev_level:
                direction = "lateral"
            else:
                direction = "downward"

            signals.append(ProgressionSignal(
                from_title=prev.title,
                to_title=curr.title,
                from_level=prev_level,
                to_level=curr_level,
                direction=direction,
            ))

        return signals

    # ── Domain relevance ──────────────────────────────────────────────────────

    def _domain_years(
        self, sorted_periods: list[WorkPeriod], job_function: str | None
    ) -> tuple[float, float]:
        """
        Returns (domain_relevant_years, total_dated_years).

        A period is domain-relevant if its title contains ≥1 keyword from
        the JD's job_function keyword group.  If no job_function is given,
        all years count as relevant.
        """
        total = sum(p.duration_years for p in sorted_periods)

        if not job_function:
            return total, total  # no JD function → all years relevant

        func_key = job_function.lower().strip()
        keywords = _FUNCTION_KEYWORDS.get(func_key)

        if not keywords:
            # Unknown function — try partial match on keyword group names
            for group_name, kws in _FUNCTION_KEYWORDS.items():
                if group_name in func_key or func_key in group_name:
                    keywords = kws
                    break

        if not keywords:
            return total, total  # can't classify → treat all as relevant

        relevant = 0.0
        for period in sorted_periods:
            title_words = set(period.title.lower().split())
            if title_words & keywords:
                relevant += period.duration_years

        return relevant, total
