"""
SkillMatcher — semantic matching of candidate skills against JD skill groups.

Single responsibility: given a list of candidate skills and a list of SkillGroups,
produce a SkillMatchResult that records which groups are satisfied and how.

Algorithm:
  1. Collect every unique text (candidate skills + group skills) into one set.
  2. Embed them all in a single batch call (minimises API round-trips).
  3. For each group, compare every JD skill against every candidate skill
     via cosine similarity; keep pairs that exceed the configured threshold.
  4. Apply match_type logic ("any" / "all") to determine group satisfaction.

DIP: depends on EmbedderBase (abstraction), never a concrete provider.
"""

import logging

from services.semantic.embedder import EmbedderBase
from services.semantic.models import (
    GroupMatchOutcome,
    SkillMatch,
    SkillMatchResult,
)
from services.vector_service import cosine_similarity  # reuse existing numpy impl

logger = logging.getLogger(__name__)

# A SkillGroup dict as stored in JDRequirements (plain dict from JSON)
_SkillGroupDict = dict


class SkillMatcher:
    """
    Matches a candidate's skill list against the required_skill_groups
    from a parsed JDRequirements object.

    Instantiate once (e.g., as a module-level singleton) since the embedder
    holds a warm cache that amortises cold-start latency across requests.
    """

    def __init__(
        self,
        embedder: EmbedderBase,
        threshold: float = 0.75,
    ) -> None:
        if not 0.0 <= threshold <= 1.0:
            raise ValueError(f"threshold must be in [0, 1], got {threshold}")
        self._embedder = embedder
        self._threshold = threshold

    # ── Public ────────────────────────────────────────────────────────────────

    async def match(
        self,
        candidate_skills: list[str],
        skill_groups: list[_SkillGroupDict],
    ) -> SkillMatchResult:
        """
        Core entry point.

        candidate_skills — raw skills from a resume (e.g. normalized_skills from CandidateProfile)
        skill_groups     — list of SkillGroup dicts from JDRequirements.required_skill_groups
                           Each dict has: skills, match_type, required, context

        Returns a SkillMatchResult with one GroupMatchOutcome per group.
        """
        if not candidate_skills or not skill_groups:
            return SkillMatchResult(outcomes=[
                GroupMatchOutcome(
                    group_skills=g.get("skills", []),
                    match_type=g.get("match_type", "any"),
                    required=g.get("required", True),
                    context=g.get("context", ""),
                )
                for g in skill_groups
            ])

        # ── 1. Collect and deduplicate all texts to embed ─────────────────────
        jd_skill_set: set[str] = set()
        for g in skill_groups:
            jd_skill_set.update(g.get("skills", []))

        all_texts = list(set(candidate_skills) | jd_skill_set)

        # ── 2. Single batch embed ─────────────────────────────────────────────
        try:
            embeddings = await self._embedder.embed_batch(all_texts)
        except Exception as exc:
            logger.error("SkillMatcher embed_batch failed: %s", exc)
            raise

        text_to_emb: dict[str, list[float]] = dict(zip(all_texts, embeddings))

        # ── 3. Per-group matching ─────────────────────────────────────────────
        outcomes: list[GroupMatchOutcome] = []
        for group in skill_groups:
            outcome = self._match_group(group, candidate_skills, text_to_emb)
            outcomes.append(outcome)

        return SkillMatchResult(outcomes=outcomes)

    # ── Internal ──────────────────────────────────────────────────────────────

    def _match_group(
        self,
        group: _SkillGroupDict,
        candidate_skills: list[str],
        text_to_emb: dict[str, list[float]],
    ) -> GroupMatchOutcome:
        """
        For one SkillGroup, find the best-matching candidate skill for each
        JD skill in the group, keeping pairs above the threshold.
        """
        group_skills: list[str] = group.get("skills", [])
        match_type: str = group.get("match_type", "any")
        required: bool = group.get("required", True)
        context: str = group.get("context", "")

        matched_jd_skills: set[str] = set()  # avoid double-counting one JD skill
        matches: list[SkillMatch] = []

        for jd_skill in group_skills:
            jd_emb = text_to_emb.get(jd_skill)
            if jd_emb is None:
                continue

            best: SkillMatch | None = None
            for cand_skill in candidate_skills:
                cand_emb = text_to_emb.get(cand_skill)
                if cand_emb is None:
                    continue

                sim = cosine_similarity(jd_emb, cand_emb)
                if sim >= self._threshold:
                    if best is None or sim > best.similarity:
                        best = SkillMatch(
                            jd_skill=jd_skill,
                            candidate_skill=cand_skill,
                            similarity=sim,
                        )

            if best is not None and jd_skill not in matched_jd_skills:
                matches.append(best)
                matched_jd_skills.add(jd_skill)

        return GroupMatchOutcome(
            group_skills=group_skills,
            match_type=match_type,
            required=required,
            context=context,
            matches=matches,
        )
