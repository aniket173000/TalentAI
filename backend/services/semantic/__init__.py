"""
services.semantic — Semantic Skills Match Scoring (E5-S2)

Public API (import from here, not from sub-modules):

    from services.semantic import score_skills, SkillScoreBreakdown

    breakdown = await score_skills(
        candidate_skills=["Python", "ETL pipeline engineer"],
        skill_groups=job.jd_requirements["required_skill_groups"],
    )
    print(breakdown.score)        # 0–30
    print(breakdown.to_dict())    # full serialisable breakdown

Module-level singletons are created lazily on first import so that
config is fully loaded before any client is instantiated.
"""

from functools import lru_cache

from config import settings

from services.semantic.embedder import CachedEmbedder, EmbedderFactory
from services.semantic.models import SkillMatchResult, SkillScoreBreakdown
from services.semantic.skill_matcher import SkillMatcher
from services.semantic.scorer import SkillScorer


# ── Singletons ────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _embedder() -> CachedEmbedder:
    return EmbedderFactory.create(
        provider=settings.SEMANTIC_EMBEDDER,
        cache_size=settings.EMBEDDING_CACHE_SIZE,
    )


@lru_cache(maxsize=1)
def _matcher() -> SkillMatcher:
    return SkillMatcher(
        embedder=_embedder(),
        threshold=settings.SKILL_MATCH_THRESHOLD,
    )


@lru_cache(maxsize=1)
def _scorer() -> SkillScorer:
    return SkillScorer(max_score=30.0)


# ── High-level entry point ────────────────────────────────────────────────────

async def score_skills(
    candidate_skills: list[str],
    skill_groups: list[dict],
) -> SkillScoreBreakdown:
    """
    Compute the semantic skill match sub-score (0–30) for one candidate.

    candidate_skills — normalised skill names from the candidate's resume
    skill_groups     — required_skill_groups from a parsed JDRequirements dict

    This is the primary callable consumed by the scoring engine and the API router.
    """
    match_result: SkillMatchResult = await _matcher().match(candidate_skills, skill_groups)
    return _scorer().compute(match_result)


# ── Re-export types ───────────────────────────────────────────────────────────
__all__ = [
    "score_skills",
    "SkillScoreBreakdown",
    "SkillMatchResult",
]
