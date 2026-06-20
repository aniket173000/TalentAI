"""
Funnel stage 3 (LLM evaluation) + stage 4 (final scoring).

The LLM runs ONLY on the top N reranked candidates (default 20) — never the
whole corpus. Each gets a qualitative evaluation (score, strengths, risks,
recommendation) via the existing screen_resume strategy. The final score blends
every stage:

    final = 0.25*embed + 0.25*skill + 0.20*rerank + 0.20*llm + 0.10*experience
"""
import asyncio
import json
import logging
from typing import Optional

from sqlalchemy.orm import Session

import models
from services.ai_service import screen_resume

logger = logging.getLogger(__name__)

MODEL_VERSION = "funnel-v1"

# Final-score weights (must sum to 1.0).
W_EMBED = 0.25
W_SKILL = 0.25
W_RERANK = 0.20
W_LLM = 0.20
W_EXPERIENCE = 0.10

_LLM_CONCURRENCY = 5


def recommendation_for(score: float) -> str:
    if score >= 80:
        return "Strong Match"
    if score >= 70:
        return "Good Match"
    if score >= 60:
        return "Possible Match"
    return "Weak Match"


def experience_match(candidate_yoe: Optional[float], jd_req: dict) -> float:
    """0-1 ratio of candidate years vs the JD's minimum requirement."""
    req_min = (jd_req or {}).get("min_years_experience")
    if not req_min:
        return 1.0
    if candidate_yoe is None:
        return 0.0
    return max(0.0, min(1.0, float(candidate_yoe) / float(req_min)))


async def evaluate_candidates(
    db: Session,
    job: models.Job,
    candidates: list[dict],
    eval_n: int = 20,
) -> list[dict]:
    """
    Run the LLM evaluation on the top `eval_n` candidates (by their incoming
    order, which is the rerank order). Mutates and returns those candidates with
    an `llm` block added.
    """
    top = candidates[:eval_n]
    if not top:
        return []

    ids = [c["id"] for c in top]
    resume_by_id = dict(
        db.query(models.Candidate.id, models.Candidate.resume_text)
        .filter(models.Candidate.id.in_(ids))
        .all()
    )

    sem = asyncio.Semaphore(_LLM_CONCURRENCY)

    async def _one(cand: dict):
        async with sem:
            resume = resume_by_id.get(cand["id"]) or ""
            try:
                res = await screen_resume(job.jd_text, resume, job.title)
            except Exception as exc:  # noqa: BLE001
                logger.warning("LLM eval failed for candidate=%s: %s", cand["id"], exc)
                cand["llm"] = {"score": None, "strengths": [], "risks": [],
                               "summary": None, "recommendation": None, "error": str(exc)[:200]}
                return
            score = float(res.get("match_score") or 0.0)
            cand["llm"] = {
                "score": round(score, 1),
                "strengths": res.get("strengths") or [],
                "risks": res.get("gaps") or [],
                "summary": res.get("summary"),
                "recommendation": recommendation_for(score),
            }

    await asyncio.gather(*[_one(c) for c in top])
    return top


def compute_final_score(cand: dict, jd_req: dict) -> dict:
    """
    Blend all stage scores into a 0-100 final score and attach the breakdown.
    Stage inputs live in cand["scores"] (0-1 except llm which is 0-100).
    """
    s = cand.get("scores", {})
    embed = float(s.get("vector") or 0.0) * 100
    skill = float(s.get("skill_match") or 0.0) * 100
    rerank = float(s.get("rerank") or 0.0) * 100
    llm = float((cand.get("llm") or {}).get("score") or 0.0)
    exp = experience_match(cand.get("total_yoe"), jd_req) * 100

    final = (
        W_EMBED * embed
        + W_SKILL * skill
        + W_RERANK * rerank
        + W_LLM * llm
        + W_EXPERIENCE * exp
    )
    cand["final_score"] = round(final, 2)
    cand["final_breakdown"] = {
        "embed": round(embed, 1),
        "skill": round(skill, 1),
        "rerank": round(rerank, 1),
        "llm": round(llm, 1),
        "experience": round(exp, 1),
        "weights": {"embed": W_EMBED, "skill": W_SKILL, "rerank": W_RERANK,
                    "llm": W_LLM, "experience": W_EXPERIENCE},
    }
    return cand


def persist_rankings(db: Session, job: models.Job, recruiter_id: int, ranked: list[dict]) -> None:
    """Replace the stored ranking set for this job with the latest funnel run."""
    db.query(models.CandidateRanking).filter(
        models.CandidateRanking.job_id == job.id
    ).delete(synchronize_session=False)

    for i, c in enumerate(ranked, start=1):
        b = c.get("final_breakdown", {})
        llm = c.get("llm") or {}
        db.add(models.CandidateRanking(
            job_id=job.id,
            candidate_id=c["id"],
            recruiter_id=recruiter_id,
            embed_score=b.get("embed"),
            skill_score=b.get("skill"),
            keyword_score=round(float(c.get("scores", {}).get("keyword_match") or 0.0) * 100, 1),
            rerank_score=b.get("rerank"),
            llm_score=llm.get("score"),
            experience_score=b.get("experience"),
            final_score=c["final_score"],
            rank=i,
            recommendation=llm.get("recommendation"),
            llm_strengths=json.dumps(llm.get("strengths") or []),
            llm_risks=json.dumps(llm.get("risks") or []),
            llm_summary=llm.get("summary"),
            model_version=MODEL_VERSION,
        ))
    db.commit()
