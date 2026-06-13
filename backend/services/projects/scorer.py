"""
ProjectScorer — evaluates a candidate's projects against the JD context.

Single responsibility: scoring math + embedding orchestration.
Complexity detection lives in complexity.py.

Algorithm:
  1. Build JD context string from title + job_function + top skills + responsibilities.
  2. Batch-embed JD context + all project texts in one API call.
  3. For each project: cosine similarity → relevance score (0–3 pts).
  4. ComplexityAnalyzer detects team/scale/impact/GitHub signals → bonus (0–1 pt).
  5. Per-project combined = relevance + complexity, capped at 4.0.
  6. Sum top-5 projects by combined score.  Total capped at 20.
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np

from services.projects.complexity import ComplexityAnalyzer
from services.projects.models import ProjectResult, ProjectScoreBreakdown

logger = logging.getLogger(__name__)

_MAX_PROJECTS = 5
_MAX_PER_PROJECT = 4.0      # 3.0 relevance + 1.0 complexity
_MAX_RELEVANCE = 3.0
_MAX_COMPLEXITY = 1.0
_MAX_TOTAL = 20.0            # 5 × 4.0


class ProjectScorer:
    """
    Stateless async scorer.  Instantiate once as a module-level singleton.

    compute() is async — it needs the embedding service.
    """

    def __init__(self, complexity_analyzer: ComplexityAnalyzer | None = None) -> None:
        self._cplx = complexity_analyzer or ComplexityAnalyzer()

    async def compute(
        self,
        projects: list[dict],           # list of ProjectEntry dicts
        jd_title: str,
        jd_requirements: dict,
    ) -> ProjectScoreBreakdown:
        """
        Compute the 0–20 project relevance sub-score.

        Only the first _MAX_PROJECTS projects are evaluated.
        If projects is empty or the embedding service is down, returns 0.
        """
        if not projects:
            return ProjectScoreBreakdown(
                score=0.0, projects_evaluated=0, projects_total=0,
                note="No projects found in candidate profile.",
            )

        # Cap at MAX_PROJECTS — PRD says "additional projects ignored"
        projects_to_eval = projects[:_MAX_PROJECTS]

        # Build JD context — rich signal for the embedding
        jd_context = self._build_jd_context(jd_title, jd_requirements)

        # Build per-project text
        project_texts = [self._project_text(p) for p in projects_to_eval]

        # Batch embed [jd_context, project1, project2, ...]
        similarities = await self._embed_similarities(jd_context, project_texts)

        # Score each project
        results: list[ProjectResult] = []
        for proj, sim in zip(projects_to_eval, similarities):
            rel_score = self._relevance_score(sim)
            signals = self._cplx.analyze(
                description=proj.get("description"),
                url=proj.get("url"),
                name=proj.get("name"),
            )
            combined = min(_MAX_PER_PROJECT, rel_score + signals.score)

            results.append(ProjectResult(
                name=proj.get("name", "Unnamed Project"),
                description=proj.get("description") or "",
                technologies=proj.get("technologies", []),
                url=proj.get("url"),
                relevance_score=round(rel_score, 3),
                complexity_score=round(signals.score, 3),
                combined_score=round(combined, 3),
                similarity=round(sim, 3) if sim is not None else None,
                complexity_signals=signals,
            ))

        # Sort by combined score descending (best projects first in output)
        results.sort(key=lambda r: r.combined_score, reverse=True)

        total = min(_MAX_TOTAL, sum(r.combined_score for r in results))

        note = self._build_note(
            len(projects), len(projects_to_eval),
            results, jd_context,
        )

        return ProjectScoreBreakdown(
            score=round(total, 2),
            max_score=_MAX_TOTAL,
            projects_evaluated=len(projects_to_eval),
            projects_total=len(projects),
            jd_context_used=jd_context,
            project_results=results,
            note=note,
        )

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _build_jd_context(title: str, jd_req: dict) -> str:
        """
        Rich context string for embedding.

        Combines: job title + job function + required skills + key responsibilities.
        Order matters — most discriminative terms first.
        """
        parts = [title]

        if jd_req.get("job_function"):
            parts.append(jd_req["job_function"])

        # Top skills from required_skill_groups
        skill_tokens: list[str] = []
        for group in jd_req.get("required_skill_groups", [])[:3]:
            skill_tokens.extend(group.get("skills", [])[:4])
        if skill_tokens:
            parts.append(" ".join(skill_tokens))

        # Preferred skills
        preferred = jd_req.get("preferred_skills", [])[:5]
        if preferred:
            parts.append(" ".join(preferred))

        # First two key responsibilities
        responsibilities = jd_req.get("key_responsibilities", [])[:2]
        parts.extend(responsibilities)

        return " ".join(p for p in parts if p).strip()

    @staticmethod
    def _project_text(proj: dict) -> str:
        """
        Concatenate project fields into a single text for embedding.
        Technologies appended last so they boost domain signal.
        """
        parts = filter(None, [
            proj.get("name", ""),
            proj.get("description", ""),
            " ".join(proj.get("technologies", [])),
        ])
        return " ".join(parts).strip()

    @staticmethod
    def _relevance_score(similarity: Optional[float]) -> float:
        """
        Map cosine similarity to 0–3 pts.

        Project descriptions and JD context use different vocabulary, so
        thresholds are calibrated lower than skill-vs-skill matching.
        """
        if similarity is None:
            return _MAX_RELEVANCE * 0.5   # fallback — neutral partial credit

        if similarity >= 0.70:
            return 3.0
        if similarity >= 0.55:
            return 2.3
        if similarity >= 0.42:
            return 1.6
        if similarity >= 0.28:
            return 0.8
        return 0.0

    @staticmethod
    async def _embed_similarities(
        jd_context: str,
        project_texts: list[str],
    ) -> list[Optional[float]]:
        """
        Batch-embed JD context + all projects in ONE API call, then compute
        cosine similarities.

        Returns None for each project on embedding failure.
        """
        try:
            from services.semantic import _embedder   # shared singleton

            all_texts = [jd_context] + project_texts
            vectors = await _embedder().embed_batch(all_texts)

            jd_vec = np.array(vectors[0], dtype=float)
            jd_norm = np.linalg.norm(jd_vec)
            if jd_norm == 0:
                return [None] * len(project_texts)

            sims: list[Optional[float]] = []
            for vec in vectors[1:]:
                pv = np.array(vec, dtype=float)
                pv_norm = np.linalg.norm(pv)
                if pv_norm == 0:
                    sims.append(None)
                else:
                    sims.append(max(0.0, float(np.dot(jd_vec, pv)) / (jd_norm * pv_norm)))
            return sims

        except Exception as exc:
            logger.warning("Project embedding failed: %s", exc)
            return [None] * len(project_texts)

    @staticmethod
    def _build_note(
        total_projects: int,
        evaluated: int,
        results: list[ProjectResult],
        jd_context: str,
    ) -> str:
        parts: list[str] = []

        if total_projects > _MAX_PROJECTS:
            parts.append(
                f"{total_projects} projects found; only top {_MAX_PROJECTS} evaluated per PRD spec."
            )

        complex_count = sum(
            1 for r in results if r.complexity_signals.score > 0
        )
        if complex_count:
            parts.append(f"{complex_count} project(s) showed complexity/impact signals.")

        zero_sim_count = sum(1 for r in results if r.similarity is not None and r.similarity < 0.25)
        if zero_sim_count == evaluated and evaluated > 0:
            parts.append(
                "No projects scored above the relevance threshold — "
                "projects may not align with this JD."
            )

        return " ".join(parts)
