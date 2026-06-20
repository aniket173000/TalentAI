"""
Stage 1 of the funnel: vector retrieval over the candidate corpus.

    JD embedding -> pgvector ANN (cosine) -> top K candidates
    -> hybrid re-score: 0.70*vector + 0.20*skill_match + 0.10*keyword_match

This narrows a large corpus to the top ~500 cheaply (no LLM per candidate).
Cross-encoder reranking (-> top 50) and LLM evaluation are later stages.
"""
import json
import logging
import re
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

import models
from services.ai_service import get_embedding
from services.pgvector_sync import to_vector_literal, sync_vector
from services.skills_normalizer import normalize_skills

logger = logging.getLogger(__name__)

W_VECTOR = 0.70
W_SKILL = 0.20
W_KEYWORD = 0.10

_TOKEN = re.compile(r"[a-z0-9+#.]{2,}")


def _json(value, default):
    if not value:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def _jd_skills(job: models.Job) -> list[str]:
    """Flatten required-skill-group skills + preferred skills from parsed JD."""
    req = _json(job.jd_requirements, {})
    skills: list[str] = []
    for group in req.get("required_skill_groups") or []:
        if isinstance(group, dict):
            skills.extend(group.get("skills") or [])
    skills.extend(req.get("preferred_skills") or [])
    return skills


def _tokens(s: str) -> set[str]:
    return set(_TOKEN.findall((s or "").lower()))


async def ensure_job_vector(db: Session, job: models.Job) -> Optional[list[float]]:
    """
    Return the job's JD embedding, computing+persisting it (TEXT + vector) if
    missing. Returns None only if embedding fails.
    """
    if job.jd_embedding:
        emb = _json(job.jd_embedding, None)
        if emb:
            return emb
    try:
        emb = await get_embedding(job.jd_text)
    except Exception as exc:  # noqa: BLE001
        logger.error("JD embedding failed for job=%s: %s", job.id, exc)
        return None
    job.jd_embedding = json.dumps(emb)
    db.add(job)
    db.commit()
    sync_vector(db, "jobs", "jd_vec", job.id, emb)
    return emb


async def retrieve_candidates(
    db: Session,
    job: models.Job,
    recruiter_id: Optional[int] = None,
    top_k: int = 500,
) -> list[dict]:
    """
    Retrieve and hybrid-score candidates against a job, sorted by hybrid score.

    recruiter_id=None ranks the WHOLE candidate base (the default — recruiters
    rank every platform candidate against a job). Passing a recruiter_id scopes
    retrieval to that recruiter's manually-uploaded candidates only.
    """
    jd_emb = await ensure_job_vector(db, job)
    if not jd_emb:
        return []

    # Stage 1: ANN retrieval (uses the HNSW index on profile_vec).
    where = "ingest_status = 'ready' AND profile_vec IS NOT NULL"
    params = {"qvec": to_vector_literal(jd_emb), "k": top_k}
    if recruiter_id is not None:
        where += " AND recruiter_id = :rid"
        params["rid"] = recruiter_id
    rows = db.execute(
        text(
            "SELECT id, 1 - (profile_vec <=> (:qvec)::vector) AS cosine_sim "
            f"FROM candidates WHERE {where} "
            "ORDER BY profile_vec <=> (:qvec)::vector "
            "LIMIT :k"
        ),
        params,
    ).fetchall()
    if not rows:
        return []

    sim_by_id = {r[0]: max(0.0, min(1.0, float(r[1]))) for r in rows}
    candidates = (
        db.query(models.Candidate)
        .filter(models.Candidate.id.in_(list(sim_by_id.keys())))
        .all()
    )

    # JD feature context (normalised skills + keyword set), computed once.
    raw_jd_skills = _jd_skills(job)
    jd_norm_skills, _, _ = normalize_skills(raw_jd_skills)
    jd_skill_set = {s.lower() for s in jd_norm_skills}
    jd_keywords = _tokens(job.title) | {s.lower() for s in raw_jd_skills}

    results = []
    for c in candidates:
        vec = sim_by_id.get(c.id, 0.0)

        cand_skills = {s.lower() for s in _json(c.normalized_skills, [])}
        skill_match = (
            len(jd_skill_set & cand_skills) / len(jd_skill_set) if jd_skill_set else 0.0
        )

        text_blob = (c.profile_summary or "") + " " + (c.resume_text or "")
        cand_tokens = _tokens(text_blob)
        keyword_match = (
            len(jd_keywords & cand_tokens) / len(jd_keywords) if jd_keywords else 0.0
        )

        hybrid = W_VECTOR * vec + W_SKILL * skill_match + W_KEYWORD * keyword_match

        results.append({
            "id": c.id,
            "full_name": c.full_name,
            "headline": c.headline,
            "location": c.location,
            "total_yoe": c.total_yoe,
            "top_skills": _json(c.normalized_skills, [])[:8],
            "scores": {
                "vector": round(vec, 4),
                "skill_match": round(skill_match, 4),
                "keyword_match": round(keyword_match, 4),
                "hybrid": round(hybrid * 100, 2),
            },
        })

    results.sort(key=lambda r: r["scores"]["hybrid"], reverse=True)
    return results
