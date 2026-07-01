"""
Stage 2 of the funnel: reranking (top 500 -> top 50) via the Cohere Rerank API.

A bi-encoder (the embedding retrieval in stage 1) is fast but coarse — it scores
query and document independently. A reranker reads the (JD, candidate) pair
jointly and produces a far more accurate relevance score, but is too expensive to
run over the whole corpus. So we run it ONLY on the ~500 candidates retrieval
already surfaced, then keep the top ~50 for LLM evaluation.

Model: Cohere `rerank-v3.5` (hosted, configurable via settings.RERANK_MODEL).
Using the hosted API means no local model (torch / sentence-transformers) is
loaded, so the service runs on small, memory-constrained hosts. Relevance
scores come back in 0..1 already.
"""
import json
import logging
from functools import lru_cache

from sqlalchemy.orm import Session

import models
from config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _client():
    import cohere
    if not settings.COHERE_API_KEY:
        raise RuntimeError(
            "COHERE_API_KEY is not set — the rerank stage needs it. "
            "Add it to backend/.env (get a key at https://dashboard.cohere.com)."
        )
    return cohere.ClientV2(api_key=settings.COHERE_API_KEY)


def warm() -> None:
    """
    Best-effort readiness check. The hosted reranker has no model to load, so we
    only verify the client can be constructed (i.e. the API key is present).
    Kept so the existing API-startup / worker-ready hooks stay valid.
    """
    try:
        _client()
        logger.info("Cohere reranker (%s) ready.", settings.RERANK_MODEL)
    except Exception as exc:  # noqa: BLE001 — warm-up is best-effort
        logger.warning("Reranker not ready (will surface at rank time): %s", exc)


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
    documents = [text_by_id.get(r["id"], "") for r in retrieved]

    # Cohere rerank returns results sorted by relevance, each carrying the input
    # `index` and a 0..1 relevance_score. Ask for all of them (top_n=len) and do
    # our own truncation so the scores dict is populated for every candidate.
    resp = _client().rerank(
        model=settings.RERANK_MODEL,
        query=query,
        documents=documents,
        top_n=len(documents),
    )

    for r in retrieved:
        r["scores"]["rerank"] = 0.0
    for result in resp.results:
        score = round(max(0.0, min(1.0, float(result.relevance_score))), 4)
        retrieved[result.index]["scores"]["rerank"] = score

    reranked = sorted(retrieved, key=lambda r: r["scores"]["rerank"], reverse=True)
    return reranked[:top_n]
