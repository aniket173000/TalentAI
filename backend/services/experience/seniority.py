"""
SeniorityClassifier — maps free-form job titles and JD seniority strings to a
numeric level so they can be compared arithmetically.

Single responsibility: seniority classification only.
No I/O, no external dependencies.

Level scale:
  0 = Unknown
  1 = Junior
  2 = Mid
  3 = Senior
  4 = Lead
  5 = Principal
  6 = Executive

Rules are ordered from most-specific to least-specific so that
"Staff Engineer" (rule 5) matches before generic "Engineer" (rule 2).
"""

from __future__ import annotations

_LEVEL_LABELS: dict[int, str] = {
    0: "Unknown",
    1: "Junior",
    2: "Mid",
    3: "Senior",
    4: "Lead",
    5: "Principal",
    6: "Executive",
}

_JD_SENIORITY_TO_LEVEL: dict[str, int] = {
    "junior": 1,
    "mid": 2,
    "senior": 3,
    "lead": 4,
    "principal": 5,
    "executive": 6,
}

# Each tuple: (keywords_to_match, level)
# Evaluated top-to-bottom; FIRST match wins — keep most-specific rules first.
_TITLE_RULES: list[tuple[tuple[str, ...], int]] = [
    # Executive
    (("chief executive", "chief technology", "chief product", "chief operating",
      "chief information", "chief data", "chief revenue",
      "cto", "ceo", "cpo", "coo", "ciso", "cdo", "cro",
      "evp", "svp", "executive vice president", "senior vice president"),      6),
    # Principal / Staff (tech IC ladder above senior)
    (("principal engineer", "principal software", "principal architect",
      "distinguished engineer", "distinguished member", "fellow",
      "staff engineer", "staff software"),                                      5),
    # Director / VP of Engineering (people manager lead)
    (("vice president", " vp ", "vp of", "director of engineering",
      "director of product", "director of technology", "head of engineering",
      "head of product", "head of technology"),                                 5),
    # Lead / Tech Lead
    (("tech lead", "technical lead", "engineering lead", "team lead",
      " lead ", "lead software", "lead engineer", "lead developer",
      "engineering manager", "senior manager"),                                 4),
    # Senior
    (("senior ", "sr.", " sr ", "sde 3", "swe 3", "sde iii", "swe iii",
      "staff ", "principal sde", "experienced"),                                3),
    # Mid (explicit signals only; default fallback is Mid)
    (("sde 2", "swe 2", "sde ii", "swe ii", "mid-level", "mid level",
      "intermediate"),                                                          2),
    # Junior / Entry
    (("junior ", "jr.", " jr ", "entry level", "entry-level",
      "associate engineer", "associate developer", "associate software",
      "graduate engineer", "graduate developer", "intern", "trainee",
      "fresher", "sde 1", "swe 1", "sde i", "swe i"),                         1),
    # Generic associate — typically junior
    (("associate",),                                                            1),
]


class SeniorityClassifier:
    """
    Stateless classifier.  Instantiate once as a module-level singleton.

    Usage:
        clf = SeniorityClassifier()
        level = clf.from_title("Senior Software Engineer")  # → 3
        label = clf.label(3)                               # → "Senior"
        jd_level = clf.from_jd_string("Senior")           # → 3
    """

    # ── Public API ────────────────────────────────────────────────────────────

    def from_title(self, title: str) -> int:
        """
        Classify a job title string into a seniority level (0–6).
        Returns 2 (Mid) as the default when no rule matches.
        """
        if not title:
            return 0

        lowered = title.lower()

        for keywords, level in _TITLE_RULES:
            if any(kw in lowered for kw in keywords):
                return level

        # Default: treat an unqualified technical title as Mid-level
        return 2

    def from_jd_string(self, value: str | None) -> int:
        """
        Map a JDRequirements.seniority string (e.g. "Senior") to a numeric level.
        Returns 0 (Unknown) for None or unrecognised values.
        """
        if not value:
            return 0
        return _JD_SENIORITY_TO_LEVEL.get(value.lower().strip(), 0)

    @staticmethod
    def label(level: int) -> str:
        """Return the human-readable label for a numeric level."""
        return _LEVEL_LABELS.get(level, "Unknown")

    @staticmethod
    def seniority_gap(candidate_level: int, jd_level: int) -> int:
        """
        Signed distance: positive = candidate over-qualified,
                         negative = candidate under-qualified,
                         0        = exact match.
        """
        if candidate_level == 0 or jd_level == 0:
            return 0  # unknown on either side — treat as no gap
        return candidate_level - jd_level
