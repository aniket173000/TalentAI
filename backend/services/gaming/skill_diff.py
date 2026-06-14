"""
Feature 2: Skill diff + gap exploit detection.

Compares normalized skills between two resume versions and checks whether
newly added skills directly map to the gaps the candidate was told about.
"""
import asyncio
import logging

from services.ai_service import get_embedding
from services.vector_service import cosine_similarity

logger = logging.getLogger(__name__)

_MATCH_THRESHOLD = 0.75  # same as skill_matcher.py


async def compute_skill_diff(
    new_skills: list[str],
    prev_skills: list[str],
    prev_gaps: list[str],
) -> dict:
    """
    Returns:
      added_skills         — skills in new but not in prev (set diff, case-insensitive)
      skills_overlap_gaps  — subset of added_skills that semantically match a prev gap
      gap_exploit_ratio    — len(overlap) / len(added) or 0.0 if nothing was added
    """
    new_set = {s.lower() for s in new_skills}
    prev_set = {s.lower() for s in prev_skills}
    added_lower = new_set - prev_set

    # Preserve original casing from new_skills
    casing = {s.lower(): s for s in new_skills}
    added_skills = [casing.get(s, s) for s in added_lower]

    if not added_skills or not prev_gaps:
        return {
            "added_skills": added_skills,
            "skills_overlap_gaps": [],
            "gap_exploit_ratio": 0.0,
        }

    # Batch-embed all texts at once to minimise API calls
    all_texts = added_skills + prev_gaps
    try:
        embeddings = await asyncio.gather(*[get_embedding(t) for t in all_texts])
    except Exception as exc:
        logger.warning("skill_diff: embedding failed, skipping gap match: %s", exc)
        return {
            "added_skills": added_skills,
            "skills_overlap_gaps": [],
            "gap_exploit_ratio": 0.0,
        }

    skill_embs = embeddings[: len(added_skills)]
    gap_embs = embeddings[len(added_skills):]

    overlapping = []
    for skill, s_emb in zip(added_skills, skill_embs):
        for g_emb in gap_embs:
            if cosine_similarity(s_emb, g_emb) >= _MATCH_THRESHOLD:
                overlapping.append(skill)
                break  # one gap match is enough to flag this skill

    ratio = len(overlapping) / len(added_skills) if added_skills else 0.0

    return {
        "added_skills": added_skills,
        "skills_overlap_gaps": overlapping,
        "gap_exploit_ratio": round(ratio, 4),
    }
