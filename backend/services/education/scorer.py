"""
EducationScorer — translates candidate education + JD requirements into a 0–20 sub-score.

Single responsibility: scoring math only.  Parsing lives in degree.py,
certification matching in certifications.py, embedding in services/semantic/.

Sub-score breakdown (max 20 pts):
  ┌──────────────────────────────────┬──────────┐
  │ Component                        │ Max pts  │
  ├──────────────────────────────────┼──────────┤
  │ Degree level match               │  12      │
  │ Field of study relevance         │   5      │
  │ Certifications bonus             │   3      │
  └──────────────────────────────────┴──────────┘

compute() is async because field-of-study similarity requires an embedding call.
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np

from services.education.certifications import CertificationScorer
from services.education.degree import DegreeClassifier
from services.education.models import DegreeLevel, EducationScoreBreakdown

logger = logging.getLogger(__name__)

# ── Component maximums ─────────────────────────────────────────────────────────
_MAX_DEGREE = 12.0
_MAX_FIELD = 5.0
_MAX_CERT = 3.0
_MAX_TOTAL = _MAX_DEGREE + _MAX_FIELD + _MAX_CERT  # 20.0

# Minimum cosine similarity to award field-of-study points
_FIELD_SIMILARITY_THRESHOLD = 0.60


class EducationScorer:
    """
    Stateless scorer — safe to use as a module-level singleton.

    compute() is the single public method; it returns an EducationScoreBreakdown.
    """

    def __init__(
        self,
        degree_classifier: DegreeClassifier | None = None,
        cert_scorer: CertificationScorer | None = None,
    ) -> None:
        self._deg = degree_classifier or DegreeClassifier()
        self._cert = cert_scorer or CertificationScorer()

    # ── Public ────────────────────────────────────────────────────────────────

    async def compute(
        self,
        education_entries: list[dict],       # list of EducationEntry dicts
        certifications: list[str],           # from CandidateProfile.certifications
        jd_education_level: Optional[str],   # JDRequirements.education_level
        jd_education_field: Optional[str],   # JDRequirements.education_field
        jd_skill_list: Optional[list[str]] = None,   # for cert keyword matching
        jd_job_function: Optional[str] = None,
    ) -> EducationScoreBreakdown:
        """
        Compute the 0–20 education sub-score.

        Async because field-of-study similarity uses the embedding service.
        Missing education → 0, not an automatic disqualifier.
        """
        # ── Degree level ──────────────────────────────────────────────────────
        cand_level, cand_field, cand_raw = self._deg.best_degree(education_entries)
        req_level = self._deg.from_jd_string(jd_education_level)

        degree_score, level_gap = self._score_degree(cand_level, req_level)

        # ── Field of study ─────────────────────────────────────────────────────
        field_score, field_sim = await self._score_field(
            candidate_field=cand_field,
            jd_field=jd_education_field,
            jd_job_function=jd_job_function,
        )

        # ── Certifications ─────────────────────────────────────────────────────
        matched, unmatched, cert_score = self._cert.score(
            certifications=certifications,
            jd_skills=jd_skill_list,
            job_function=jd_job_function,
            education_field=jd_education_field,
        )

        total = min(_MAX_TOTAL, degree_score + field_score + cert_score)

        note = self._build_note(
            cand_level, req_level, level_gap,
            cand_field, jd_education_field,
            field_sim, len(matched),
        )

        return EducationScoreBreakdown(
            score=round(total, 2),
            max_score=_MAX_TOTAL,
            degree_score=round(degree_score, 2),
            field_score=round(field_score, 2),
            certification_score=round(cert_score, 2),
            candidate_degree_level=int(cand_level),
            candidate_degree_label=DegreeLevel.label(int(cand_level)),
            candidate_degree_string=cand_raw,
            candidate_field=cand_field,
            required_degree_level=int(req_level),
            required_degree_label=DegreeLevel.label(int(req_level)),
            degree_level_gap=level_gap,
            jd_education_field=jd_education_field,
            field_similarity=round(field_sim, 3) if field_sim is not None else None,
            matched_certifications=matched,
            unmatched_certifications=unmatched,
            note=note,
        )

    # ── Sub-scorers ───────────────────────────────────────────────────────────

    @staticmethod
    def _score_degree(
        candidate: DegreeLevel, required: DegreeLevel
    ) -> tuple[float, int]:
        """
        Score: 0–12 pts.

        No JD requirement → full marks.
        Candidate meets or exceeds requirement → full marks.
        Below by 1 level → 8 pts (may still be effective with experience).
        Below by 2 levels → 4 pts (significant gap).
        Below by 3+ levels → 1 pt.
        No education info → 0 pts.
        """
        if required == DegreeLevel.NONE:
            return _MAX_DEGREE, 0   # no requirement → full marks

        if candidate == DegreeLevel.NONE:
            return 0.0, -int(required)   # unknown education → conservative zero

        gap = int(candidate) - int(required)   # positive = over-qualified

        if gap >= 0:
            return _MAX_DEGREE, gap   # meets or exceeds

        # Under-qualified
        score_table = {-1: 8.0, -2: 4.0, -3: 1.0}
        score = score_table.get(gap, 0.0)   # ≤ -4 → 0
        return score, gap

    async def _score_field(
        self,
        candidate_field: Optional[str],
        jd_field: Optional[str],
        jd_job_function: Optional[str],
    ) -> tuple[float, Optional[float]]:
        """
        Score: 0–5 pts using cosine similarity between the candidate's field
        of study and a JD context string.

        No JD field AND no job_function → full marks.
        No candidate field → 0 pts.
        """
        jd_context = " ".join(filter(None, [jd_field, jd_job_function])).strip()

        if not jd_context:
            return _MAX_FIELD, None   # JD has no field preference → full marks

        if not candidate_field:
            return 0.0, None   # no field on CV → 0 pts

        similarity = await self._embed_similarity(candidate_field, jd_context)
        if similarity is None:
            # Embedding service down — award neutral partial score
            return _MAX_FIELD * 0.5, None

        score = self._similarity_to_score(similarity)
        return score, similarity

    @staticmethod
    def _similarity_to_score(similarity: float) -> float:
        """
        Map cosine similarity to a 0–5 point score.

        ≥ 0.90 → 5.0   (very close match, e.g. "Computer Science" vs "CS")
        ≥ 0.75 → 4.0   (strong match)
        ≥ 0.60 → 3.0   (moderate relevance)
        ≥ 0.45 → 1.5   (adjacent field)
        < 0.45 → 0.0   (unrelated)
        """
        if similarity >= 0.90:
            return 5.0
        if similarity >= 0.75:
            return 4.0
        if similarity >= 0.60:
            return 3.0
        if similarity >= 0.45:
            return 1.5
        return 0.0

    @staticmethod
    async def _embed_similarity(text_a: str, text_b: str) -> Optional[float]:
        """
        Compute cosine similarity between two short texts using the shared
        embedding service from services.semantic.

        Returns None on failure so the caller can award a neutral fallback.
        """
        try:
            from services.semantic import _embedder   # shared singleton

            embedder = _embedder()
            vec_a, vec_b = await embedder.embed_batch([text_a, text_b])

            # Cosine similarity
            dot = float(np.dot(vec_a, vec_b))
            norm = float(np.linalg.norm(vec_a) * np.linalg.norm(vec_b))
            if norm == 0:
                return None
            return max(0.0, dot / norm)

        except Exception as exc:
            logger.warning("Field similarity embedding failed: %s", exc)
            return None

    # ── Note builder ──────────────────────────────────────────────────────────

    @staticmethod
    def _build_note(
        cand_level: DegreeLevel,
        req_level: DegreeLevel,
        level_gap: int,
        cand_field: Optional[str],
        jd_field: Optional[str],
        field_sim: Optional[float],
        matched_certs: int,
    ) -> str:
        parts = []

        if cand_level == DegreeLevel.NONE and req_level != DegreeLevel.NONE:
            parts.append(
                f"No degree information found; JD requires {DegreeLevel.label(int(req_level))}."
            )
        elif level_gap < -1:
            parts.append(
                f"Candidate's highest degree ({DegreeLevel.label(int(cand_level))}) is "
                f"{abs(level_gap)} level(s) below JD requirement "
                f"({DegreeLevel.label(int(req_level))})."
            )

        if jd_field and not cand_field:
            parts.append(
                "Field of study could not be extracted from degree string."
            )
        elif jd_field and field_sim is not None and field_sim < _FIELD_SIMILARITY_THRESHOLD:
            parts.append(
                f"Field similarity {field_sim:.2f} below threshold — "
                f"'{cand_field}' may not align with JD field '{jd_field}'."
            )

        if matched_certs > 0:
            parts.append(f"{matched_certs} relevant certification(s) found.")

        return " ".join(parts)
