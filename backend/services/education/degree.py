"""
DegreeClassifier — maps free-form degree strings to a numeric ordinal level
and extracts the field of study.

Single responsibility: classification only.  No scoring math, no I/O.

Ordinal scale:
  0 = None / Unknown
  1 = Diploma / Associate / Certificate
  2 = Bachelor (B.Sc., B.A., B.E., BEng, BE, BS, BA …)
  3 = Master (M.Sc., M.A., M.B.A., M.Eng., MS, MA …)
  4 = PhD / Doctorate / D.Phil
"""

from __future__ import annotations

import re
from typing import Optional

from services.education.models import DegreeLevel

# ── Degree-level detection rules ─────────────────────────────────────────────
# Each tuple: (keywords_to_match_in_degree_string, DegreeLevel)
# Evaluated top-to-bottom; FIRST match wins — keep most-specific first.
_DEGREE_RULES: list[tuple[tuple[str, ...], DegreeLevel]] = [
    # PhD / Doctorate
    (
        ("ph.d", "phd", "d.phil", "dphil", "doctor of philosophy",
         "doctor of science", "d.sc", "dsc", "doctorate"),
        DegreeLevel.PHD,
    ),
    # Master
    (
        ("master of", "master's", "masters", "m.sc", "msc", "m.s.", " ms ",
         "m.a.", " ma ", "m.b.a", "mba", "m.eng", "meng", "m.tech", "mtech",
         "m.e.", " me ", "postgraduate", "post-graduate"),
        DegreeLevel.MASTER,
    ),
    # Bachelor
    (
        ("bachelor of", "bachelor's", "bachelors", "b.sc", "bsc", "b.s.", " bs ",
         "b.a.", " ba ", "b.e.", " be ", "b.tech", "btech", "b.eng", "beng",
         "undergraduate", "honours", "honors"),
        DegreeLevel.BACHELOR,
    ),
    # Diploma / Associate / Certificate (specific terms before generic "diploma")
    (
        ("associate of", "associate's", "associates",
         "diploma", "advanced diploma", "higher national diploma",
         "hnd", "hnc", "certificate", "certification course",
         "professional certificate"),
        DegreeLevel.DIPLOMA,
    ),
]

# ── Field extraction — strip degree keywords to reveal the subject ────────────
# Prefixes and suffixes to remove to isolate the field of study.
_STRIP_PREFIXES: tuple[str, ...] = (
    "doctor of philosophy in", "doctor of science in", "phd in",
    "master of science in", "master of arts in", "master of engineering in",
    "master of technology in", "master of business administration in",
    "master of ", "masters in", "m.sc. in", "msc in", "m.s. in", "ms in",
    "m.a. in", "ma in", "m.b.a in", "mba in", "m.eng in", "mtech in",
    "bachelor of science in", "bachelor of arts in", "bachelor of engineering in",
    "bachelor of technology in", "bachelor of ", "bachelors in",
    "b.sc. in", "bsc in", "b.s. in", "bs in", "b.a. in", "ba in",
    "b.tech in", "btech in", "b.eng in", "beng in",
    "diploma in", "certificate in",
    "doctor of philosophy", "master of science", "master of arts",
    "master of engineering", "master of business administration",
    "bachelor of science", "bachelor of arts", "bachelor of engineering",
    "bachelor of technology",
    "ph.d.", "phd", "m.sc.", "msc", "m.s.", "m.a.", "mba", "m.b.a.",
    "m.eng.", "meng", "m.tech", "mtech",
    "b.sc.", "bsc", "b.s.", "b.a.", "b.e.", "b.eng.", "beng",
    "b.tech", "btech",
)


class DegreeClassifier:
    """
    Stateless classifier.  Instantiate once as a module-level singleton.

    Usage:
        clf = DegreeClassifier()
        level, field = clf.classify("M.Sc. Computer Science")
        # → (DegreeLevel.MASTER, "Computer Science")
        best = clf.best_degree(education_list)
        # → (DegreeLevel.MASTER, "Computer Science", "M.Sc. Computer Science")
    """

    def classify(self, degree_string: str) -> tuple[DegreeLevel, Optional[str]]:
        """
        Map a free-form degree string to (DegreeLevel, field_of_study).

        field_of_study is None when extraction fails or the string is empty.
        """
        if not degree_string or not degree_string.strip():
            return DegreeLevel.NONE, None

        normalized = degree_string.strip().lower()

        level = self._detect_level(normalized)
        field = self._extract_field(degree_string)   # preserve original casing

        return level, field

    def best_degree(
        self, education_entries: list[dict]
    ) -> tuple[DegreeLevel, Optional[str], str]:
        """
        Find the highest degree from a list of EducationEntry dicts.

        Returns (level, field_of_study, raw_degree_string).
        Returns (NONE, None, "") when the list is empty or unparseable.
        """
        best_level = DegreeLevel.NONE
        best_field: Optional[str] = None
        best_raw: str = ""

        for entry in education_entries:
            raw = entry.get("degree", "") or ""
            if not raw.strip():
                continue

            level, field = self.classify(raw)
            if level > best_level:
                best_level = level
                best_field = field
                best_raw = raw

        return best_level, best_field, best_raw

    def from_jd_string(self, value: Optional[str]) -> DegreeLevel:
        """
        Map a JDRequirements.education_level string to a DegreeLevel.
        Accepts: "Diploma", "Bachelor", "Master", "PhD" (case-insensitive).
        Returns DegreeLevel.NONE for None or unrecognised values.
        """
        if not value:
            return DegreeLevel.NONE

        mapping = {
            "diploma": DegreeLevel.DIPLOMA,
            "bachelor": DegreeLevel.BACHELOR,
            "master": DegreeLevel.MASTER,
            "phd": DegreeLevel.PHD,
        }
        return mapping.get(value.lower().strip(), DegreeLevel.NONE)

    # ── Private helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _detect_level(normalized: str) -> DegreeLevel:
        for keywords, level in _DEGREE_RULES:
            if any(kw in normalized for kw in keywords):
                return level
        return DegreeLevel.NONE

    @staticmethod
    def _extract_field(degree_string: str) -> Optional[str]:
        """
        Strip degree keywords from the string, leaving only the subject area.

        E.g.:
          "B.Sc. Computer Science"   → "Computer Science"
          "Master of Science in AI"  → "AI"
          "MBA"                      → None  (no subject left)
          "PhD"                      → None
        """
        s = degree_string.strip()
        lowered = s.lower()

        # Try sorted by length descending so longer prefixes match first
        for prefix in sorted(_STRIP_PREFIXES, key=len, reverse=True):
            if lowered.startswith(prefix):
                remainder = s[len(prefix):].strip().strip("(),.-").strip()
                if len(remainder) >= 2:
                    # Title-case cleanup: "computer science" → "Computer Science"
                    return remainder[0].upper() + remainder[1:]
                return None

        # Fallback: try splitting on common separators
        # "B.Sc., Computer Science" or "MSc - Data Science"
        for sep in (",", " - ", " – ", ":"):
            if sep in s:
                parts = [p.strip() for p in s.split(sep, 1)]
                # Right side is usually the subject when left side is the degree token
                candidate = parts[1].strip()
                if len(candidate) >= 2 and not DegreeClassifier._detect_level(candidate.lower()):
                    return candidate

        # No recognisable field
        return None
