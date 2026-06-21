"""
Stage 2 of the funnel: cross-encoder reranking (top 500 -> top 50).

A bi-encoder (the embedding retrieval in stage 1) is fast but coarse — it scores
query and document independently. A cross-encoder reads the (JD, candidate) pair
jointly and produces a far more accurate relevance score, but is too expensive to
run over the whole corpus. So we run it ONLY on the ~500 candidates retrieval
already surfaced, then keep the top ~50 for LLM evaluation.

Model: BAAI/bge-reranker-base (local, CPU-friendly). Loaded lazily on first use
(~400MB download on first call) and cached for the process lifetime.
"""
import json
import logging
from functools import lru_cache

from sqlalchemy.orm import Session

import models

logger = logging.getLogger(__name__)

MODEL_NAME = "BAAI/bge-reranker-base"


@lru_cache(maxsize=1)
def _model():
    from sentence_transformers import CrossEncoder
    logger.info("Loading cross-encoder %s (first call downloads the model)…", MODEL_NAME)
    return CrossEncoder(MODEL_NAME)


def warm() -> None:
    """
    Eagerly load (and lightly exercise) the cross-encoder so the FIRST rank
    doesn't pay the ~25s model-load cost. Called at API/worker startup.
    """
    try:
        _model().predict([["warmup query", "warmup passage"]])
        logger.info("Cross-encoder %s warmed and ready.", MODEL_NAME)
    except Exception as exc:  # noqa: BLE001 — warm-up is best-effort
        logger.warning("Reranker warm-up failed (will load lazily): %s", exc)


def _jd_query(job: models.Job) -> str:
    """
    Build a NATURAL-LANGUAGE query for the cross-encoder.

    bge-reranker is trained on prose query/passage pairs. Newline-delimited
    "Skills: a, b, c" lists make it fixate on generic "Senior … Engineer"
    phrasing and stop discriminating on skills. A natural sentence seeded with
    the structured JD signal separates candidates correctly; raw jd_text is only
    a fallback when the JD hasn't been parsed.
    """
    title = job.title or "this role"
    req = {}
    if job.jd_requirements:
        try:
            req = json.loads(job.jd_requirements)
        except Exception:
            req = {}

    skills: list[str] = []
    for group in req.get("required_skill_groups") or []:
        if isinstance(group, dict):
            skills.extend(group.get("skills") or [])
    skills.extend(req.get("preferred_skills") or [])

    if not skills:  # JD not parsed — fall back to raw prose
        return (title + ". " + (job.jd_text or "")[:800]).strip()

    # NOTE: deliberately EXCLUDE key_responsibilities. Generic responsibility
    # prose ("design scalable systems", "shape engineering culture") reads as
    # senior-engineer-in-general and makes the reranker lose skill discrimination
    # (verified: it flips a backend job to rank a frontend candidate #1).
    return (
        f"We are hiring a {title}. "
        f"The ideal candidate has hands-on experience with {', '.join(skills[:25])}."
    )


def _candidate_text(headline, total_yoe, normalized_skills_json, profile_summary, resume_text) -> str:
    """Natural-language candidate blurb from structured fields (prose, not a list)."""
    try:
        skills = json.loads(normalized_skills_json or "[]")
    except Exception:
        skills = []

    if headline or skills:
        head = headline or "Candidate"
        if total_yoe:
            sentence = f"{head} with {total_yoe} years of experience"
        else:
            sentence = head
        if skills:
            sentence += ", skilled in " + ", ".join(skills[:25])
        return sentence + "."

    return profile_summary or (resume_text or "")[:2000]


def rerank_candidates(
    db: Session,
    job: models.Job,
    retrieved: list[dict],
    top_n: int = 50,
) -> list[dict]:
    """
    Rerank stage-1 results with the cross-encoder and return the top_n.

    `retrieved` are dicts from retrieval.retrieve_candidates (each has "id" and a
    "scores" dict). Each result gets scores["rerank"] (0-1) added; the list is
    re-sorted by it and truncated to top_n.
    """
    if not retrieved:
        return []

    ids = [r["id"] for r in retrieved]
    rows = (
        db.query(
            models.Candidate.id,
            models.Candidate.headline,
            models.Candidate.total_yoe,
            models.Candidate.normalized_skills,
            models.Candidate.profile_summary,
            models.Candidate.resume_text,
        )
        .filter(models.Candidate.id.in_(ids))
        .all()
    )
    text_by_id = {
        rid: _candidate_text(headline, yoe, skills, ps, rt)
        for rid, headline, yoe, skills, ps, rt in rows
    }

    query = _jd_query(job)
    pairs = [[query, text_by_id.get(r["id"], "")] for r in retrieved]

    # bge-reranker via CrossEncoder.predict already returns 0..1 relevance
    # probabilities — do NOT apply another activation.
    scores = _model().predict(pairs)

    for r, score in zip(retrieved, scores):
        r["scores"]["rerank"] = round(max(0.0, min(1.0, float(score))), 4)

    reranked = sorted(retrieved, key=lambda r: r["scores"]["rerank"], reverse=True)
    return reranked[:top_n]
