"""
Vector utilities for fast candidate-vs-JD comparison.

Embeddings (text-embedding-3-small, 1536-d) are stored as JSON text in the DB.
cosine_similarity runs in O(d) via numpy. find_rank_position uses bisect for O(log n).
"""
import bisect
import json
import logging

import numpy as np

logger = logging.getLogger(__name__)


def cosine_similarity(a: list[float], b: list[float]) -> float:
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    norm = np.linalg.norm(va) * np.linalg.norm(vb)
    return float(np.dot(va, vb) / norm) if norm > 1e-10 else 0.0


def find_rank_position(sorted_scores_desc: list[float], new_score: float) -> int:
    """
    Binary-search the rank (1-based) for new_score in a descending-sorted score list.
    E.g. scores=[95,90,85], new_score=88 → rank 3.
    """
    neg = [-s for s in sorted_scores_desc]
    return bisect.bisect_right(neg, -new_score) + 1


def blend_score(gpt_score: float, cosine_sim: float, gpt_weight: float = 0.75) -> float:
    """
    Merge GPT semantic score (0-100) with cosine similarity (0-1).
    cosine_sim is scaled to 0-100 before blending.
    """
    return round(gpt_weight * gpt_score + (1 - gpt_weight) * (cosine_sim * 100), 2)


def rank_applications_by_vector(applications: list, jd_embedding: list[float]) -> list:
    """
    Re-sort accepted applications by cosine similarity to the JD embedding.
    Falls back to match_score when an embedding is missing.
    """
    def _sim(app) -> float:
        if app.resume_embedding:
            try:
                return cosine_similarity(json.loads(app.resume_embedding), jd_embedding)
            except Exception:
                pass
        return app.match_score / 100.0

    return sorted(applications, key=_sim, reverse=True)
