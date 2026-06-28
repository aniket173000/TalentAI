"""
Funnel stage 3 (LLM evaluation) + stage 4 (final scoring).

The LLM runs ONLY on the top N reranked candidates (default 20) — never the
whole corpus. Each gets a qualitative evaluation (score, strengths, risks,
recommendation) via the existing screen_resume strategy. The final score blends
every stage:

    final = 0.30*role_fit + 0.25*skills + 0.15*experience + 0.15*ai_fluency + 0.15*assessment

Recruiter-facing factors (each 0-100), chosen to be distinct and legible — no
ML jargon:
    Role Fit         overall match of the profile to the JD (embedding + rerank)
    Skills Match     coverage of the must-have skills
    Experience       seniority / years vs the role's requirement
    AI Fluency       how effectively the candidate uses AI in their work
    Overall Assess.  the LLM recruiter's holistic verdict
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

# Final-score weights (must sum to 1.0). These map to the recruiter-facing
# factors, not raw funnel stages.
W_ROLE_FIT = 0.30      # embedding + rerank, blended into one "Role Fit" number
W_SKILLS = 0.25        # must-have skills coverage
W_EXPERIENCE = 0.15    # years / seniority vs the JD
W_AI_FLUENCY = 0.15    # how well the candidate uses AI in their work (LLM-derived)
W_ASSESSMENT = 0.15    # LLM holistic verdict

# Role Fit blends semantic similarity (embedding) with the precise cross-encoder
# (rerank). Rerank is the more reliable signal, so it carries more weight.
ROLE_FIT_EMBED = 0.45
ROLE_FIT_RERANK = 0.55

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
    eval_n: int = 10,
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
            fluency = res.get("ai_fluency") or {}
            cand["llm"] = {
                "score": round(score, 1),
                "strengths": res.get("strengths") or [],
                "risks": res.get("gaps") or [],
                "summary": res.get("summary"),
                "recommendation": recommendation_for(score),
                "ai_fluency": round(float(fluency.get("score") or 0.0), 1),
                "ai_fluency_note": fluency.get("rationale") or (
                    "; ".join(fluency.get("signals") or []) or None
                ),
            }

    await asyncio.gather(*[_one(c) for c in top])
    return top


def role_fit_score(embed: float, rerank: float) -> float:
    """Blend semantic (embedding) + precise (rerank) relevance into one number.
    Falls back to embedding alone when the candidate was not reranked."""
    if rerank:
        return ROLE_FIT_EMBED * embed + ROLE_FIT_RERANK * rerank
    return embed


def compute_final_score(cand: dict, jd_req: dict) -> dict:
    """
    Blend the recruiter-facing factors into a 0-100 final score and attach the
    breakdown. Stage inputs live in cand["scores"] (0-1) and cand["llm"] (0-100).

    AI Fluency and Overall Assessment only exist for LLM-evaluated candidates;
    when absent, the final score is renormalised over the available factors so
    those candidates are not unfairly zeroed.
    """
    s = cand.get("scores", {})
    embed = float(s.get("vector") or 0.0) * 100
    skill = float(s.get("skill_match") or 0.0) * 100
    rerank = float(s.get("rerank") or 0.0) * 100
    llm_block = cand.get("llm") or {}
    assessment = llm_block.get("score")           # 0-100 or None
    ai_fluency = llm_block.get("ai_fluency")       # 0-100 or None
    exp = experience_match(cand.get("total_yoe"), jd_req) * 100
    role_fit = role_fit_score(embed, rerank)

    # (weight, value) for every factor that is actually available.
    components = [
        (W_ROLE_FIT, role_fit),
        (W_SKILLS, skill),
        (W_EXPERIENCE, exp),
    ]
    if ai_fluency is not None:
        components.append((W_AI_FLUENCY, float(ai_fluency)))
    if assessment is not None:
        components.append((W_ASSESSMENT, float(assessment)))

    wsum = sum(w for w, _ in components)
    final = sum(w * v for w, v in components) / wsum if wsum else 0.0

    cand["final_score"] = round(final, 2)
    cand["final_breakdown"] = {
        "role_fit": round(role_fit, 1),
        "skills": round(skill, 1),
        "experience": round(exp, 1),
        "ai_fluency": round(float(ai_fluency), 1) if ai_fluency is not None else None,
        "assessment": round(float(assessment), 1) if assessment is not None else None,
        # raw stage scores retained for storage / debugging
        "embed": round(embed, 1),
        "rerank": round(rerank, 1),
        "weights": {"role_fit": W_ROLE_FIT, "skills": W_SKILLS,
                    "experience": W_EXPERIENCE, "ai_fluency": W_AI_FLUENCY,
                    "assessment": W_ASSESSMENT},
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
            skill_score=b.get("skills"),
            keyword_score=round(float(c.get("scores", {}).get("keyword_match") or 0.0) * 100, 1),
            rerank_score=b.get("rerank"),
            llm_score=llm.get("score"),
            experience_score=b.get("experience"),
            ai_fluency_score=llm.get("ai_fluency"),
            ai_fluency_note=llm.get("ai_fluency_note"),
            final_score=c["final_score"],
            rank=i,
            recommendation=llm.get("recommendation"),
            llm_strengths=json.dumps(llm.get("strengths") or []),
            llm_risks=json.dumps(llm.get("risks") or []),
            llm_summary=llm.get("summary"),
            model_version=MODEL_VERSION,
        ))
    db.commit()
