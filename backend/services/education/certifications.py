"""
CertificationScorer — scores candidate certifications against JD context.

Single responsibility: certification relevance only.  No degree logic, no I/O.

Strategy:
  1. Build a keyword set from JD skills + job function + education_field.
  2. For each candidate certification, check whether any JD keyword appears
     in the cert name (or vice versa).
  3. Each unique matching cert = 1 point, capped at MAX_CERT_SCORE (3 pts).

Keyword normalisation strips common words ("certified", "associate", "professional",
"foundation") so that e.g. "AWS Certified Developer" matches "AWS" in JD skills.
"""

from __future__ import annotations

import re
from typing import Optional

from services.education.models import CertificationMatch

# Stopwords that carry no relevance signal when appearing alone
_CERT_STOPWORDS = frozenset({
    "certified", "associate", "professional", "practitioner", "foundation",
    "advanced", "expert", "specialist", "engineer", "architect", "developer",
    "administrator", "analyst", "manager", "certification", "certificate",
    "credential", "the", "and", "for", "in", "of", "a", "an",
})

MAX_CERT_SCORE = 3.0   # hard cap per PRD


def _tokenize(text: str) -> set[str]:
    """Lower-case, split on non-alphanumeric, remove stopwords."""
    tokens = set(re.split(r"[^a-z0-9]+", text.lower())) - {""} - _CERT_STOPWORDS
    return tokens


class CertificationScorer:
    """
    Stateless scorer.  Instantiate once as a module-level singleton.

    Usage:
        scorer = CertificationScorer()
        matched, unmatched, score = scorer.score(
            certifications=["AWS Certified Solutions Architect", "PMP"],
            jd_skills=["AWS", "Cloud", "Project Management"],
            job_function="engineering",
        )
    """

    def score(
        self,
        certifications: list[str],
        jd_skills: Optional[list[str]] = None,
        job_function: Optional[str] = None,
        education_field: Optional[str] = None,
    ) -> tuple[list[CertificationMatch], list[str], float]:
        """
        Score certifications against JD context.

        Returns (matched, unmatched, total_score).
        total_score is capped at MAX_CERT_SCORE.
        """
        if not certifications:
            return [], [], 0.0

        # Build JD keyword set
        jd_tokens: set[str] = set()
        for skill in (jd_skills or []):
            jd_tokens |= _tokenize(skill)
        if job_function:
            jd_tokens |= _tokenize(job_function)
        if education_field:
            jd_tokens |= _tokenize(education_field)

        # Always include high-value certification families regardless of JD
        jd_tokens |= _HIGH_VALUE_CERT_TOKENS

        matched: list[CertificationMatch] = []
        unmatched: list[str] = []
        seen_certs: set[str] = set()   # deduplicate same cert listed twice

        for cert in certifications:
            cert_stripped = cert.strip()
            if not cert_stripped or cert_stripped.lower() in seen_certs:
                continue
            seen_certs.add(cert_stripped.lower())

            cert_tokens = _tokenize(cert_stripped)
            overlap = cert_tokens & jd_tokens

            if overlap:
                keyword_hit = max(overlap, key=len)   # most specific keyword
                matched.append(CertificationMatch(
                    certification=cert_stripped,
                    matched_keyword=keyword_hit,
                    relevance_score=1.0,
                ))
            else:
                unmatched.append(cert_stripped)

        score = min(MAX_CERT_SCORE, float(len(matched)))
        return matched, unmatched, score


# ── High-value certification tokens ──────────────────────────────────────────
# These are always considered relevant regardless of JD keywords because they
# signal competency that benefits almost any technical or business role.
_HIGH_VALUE_CERT_TOKENS: frozenset[str] = frozenset({
    # Cloud platforms
    "aws", "gcp", "azure", "google", "cloud",
    # Project/management
    "pmp", "scrum", "agile", "prince2", "capm", "safe",
    # Security
    "cissp", "cisa", "cism", "comptia", "security", "ceh",
    # Data / ML
    "databricks", "snowflake", "tensorflow", "pytorch",
    # Finance
    "cfa", "cpa", "frm", "acca",
    # DevOps / infra
    "kubernetes", "docker", "terraform", "ansible",
    # General tech
    "oracle", "salesforce", "sap",
})
