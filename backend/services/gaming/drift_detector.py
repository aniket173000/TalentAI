"""
Feature 6: Embedding drift detection.

Measures whether a candidate's resume is converging suspiciously toward
the job description between submissions.
"""
import asyncio
import logging

from services.ai_service import get_embedding
from services.vector_service import cosine_similarity

logger = logging.getLogger(__name__)


async def compute_drift(
    new_resume_text: str,
    prev_resume_text: str,
    jd_text: str,
) -> dict:
    """
    Returns:
      resume_jd_similarity       — cosine(new_resume, JD)
      prev_resume_jd_similarity  — cosine(prev_resume, JD)
      similarity_delta           — new − prev  (positive = converging toward JD)
      resume_self_similarity     — cosine(new_resume, prev_resume)  (1.0 = identical)
    """
    try:
        new_emb, prev_emb, jd_emb = await asyncio.gather(
            get_embedding(new_resume_text),
            get_embedding(prev_resume_text),
            get_embedding(jd_text),
        )
    except Exception as exc:
        logger.warning("drift_detector: embedding failed: %s", exc)
        return {
            "resume_jd_similarity": None,
            "prev_resume_jd_similarity": None,
            "similarity_delta": None,
            "resume_self_similarity": None,
        }

    current_sim = cosine_similarity(new_emb, jd_emb)
    prev_sim = cosine_similarity(prev_emb, jd_emb)
    self_sim = cosine_similarity(new_emb, prev_emb)

    return {
        "resume_jd_similarity": round(current_sim, 4),
        "prev_resume_jd_similarity": round(prev_sim, 4),
        "similarity_delta": round(current_sim - prev_sim, 4),
        "resume_self_similarity": round(self_sim, 4),
    }
