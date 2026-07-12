"""
Funnel stage 3 (LLM evaluation) + stage 4 (final scoring).

The LLM runs ONLY on the top N reranked candidates (default 20) — never the
whole corpus. Each gets a qualitative evaluation (score, strengths, risks,
recommendation) via the existing screen_resume strategy, plus education and
project proof-of-skill sub-scores (reused from the composite scoring engine
in services/education and services/projects). The final score blends every
factor:

    final = 0.20*role_fit + 0.20*skills + 0.15*experience + 0.15*projects
            + 0.10*education + 0.10*ai_fluency + 0.10*assessment

Recruiter-facing factors (each 0-100), chosen to be distinct and legible — no
ML jargon:
    Role Fit         overall match of the profile to the JD (embedding + rerank)
    Skills Match     coverage of the must-have skills
    Experience       seniority / years vs the role's requirement
    Projects         proof of skill via project relevance + complexity
    Education        degree level, field relevance, certifications
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
from services.education import score_education
from services.projects import score_projects

logger = logging.getLogger(__name__)

MODEL_VERSION = "funnel-v2"

# Final-score weights (must sum to 1.0). These map to the recruiter-facing
# factors, not raw funnel stages.
W_ROLE_FIT = 0.20      # embedding + rerank, blended into one "Role Fit" number
W_SKILLS = 0.20        # must-have skills coverage
W_EXPERIENCE = 0.15    # years / seniority vs the JD
W_PROJECTS = 0.15      # proof of skill via projects (reused composite sub-scorer)
W_EDUCATION = 0.10     # degree/field/certifications (reused composite sub-scorer)
W_AI_FLUENCY = 0.10    # how well the candidate uses AI in their work (LLM-derived)
W_ASSESSMENT = 0.10    # LLM holistic verdict

# Role Fit blends semantic similarity (embedding) with the precise cross-encoder
# (rerank). Rerank is the more reliable signal, so it carries more weight.
ROLE_FIT_EMBED = 0.45
ROLE_FIT_RERANK = 0.55

_LLM_CONCURRENCY = 8


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


def _json(raw: Optional[str], default):
    if not raw:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


async def evaluate_candidates(
    db: Session,
    job: models.Job,
    candidates: list[dict],
    jd_req: Optional[dict] = None,
    eval_n: int = 10,
) -> list[dict]:
    """
    Run the LLM evaluation on the top `eval_n` candidates (by their incoming
    order, which is the rerank order), plus the education/projects sub-scorers
    reused from the composite scoring engine. Mutates and returns those
    candidates with `llm`, `education`, and `projects` blocks added.
    """
    top = candidates[:eval_n]
    if not top:
        return []

    jd_req = jd_req or {}
    ids = [c["id"] for c in top]
    rows = (
        db.query(
            models.Candidate.id,
            models.Candidate.resume_text,
            models.Candidate.education,
            models.Candidate.projects,
            models.Candidate.certifications,
        )
        .filter(models.Candidate.id.in_(ids))
        .all()
    )
    by_id = {r.id: r for r in rows}

    sem = asyncio.Semaphore(_LLM_CONCURRENCY)

    async def _one(cand: dict):
        async with sem:
            row = by_id.get(cand["id"])
            resume = (row.resume_text if row else None) or ""

            try:
                res = await screen_resume(job.jd_text, resume, job.title)
            except Exception as exc:  # noqa: BLE001
                logger.warning("LLM eval failed for candidate=%s: %s", cand["id"], exc)
                cand["llm"] = {"score": None, "strengths": [], "risks": [],
                               "summary": None, "recommendation": None, "error": str(exc)[:200]}
            else:
                score = float(res.get("match_score") or 0.0)
                fluency = res.get("ai_fluency") or {}
                cand["llm"] = {
                    "score": round(score, 1),
                    "strengths": res.get("strengths") or [],
                    "risks": res.get("gaps") or [],
                    "summary": res.get("summary"),
                    "ai_fluency": round(float(fluency.get("score") or 0.0), 1),
                    "ai_fluency_note": fluency.get("rationale") or (
                        "; ".join(fluency.get("signals") or []) or None
                    ),
                }

            education_entries = _json(row.education if row else None, [])
            projects_entries = _json(row.projects if row else None, [])
            certifications = _json(row.certifications if row else None, [])

            try:
                edu_bd, proj_bd = await asyncio.gather(
                    score_education(education_entries, certifications, jd_req),
                    score_projects(projects_entries, job.title, jd_req),
                )
                cand["education"] = round(edu_bd.score / edu_bd.max_score * 100, 1) if edu_bd.max_score else None
                cand["projects"] = round(proj_bd.score / proj_bd.max_score * 100, 1) if proj_bd.max_score else None
            except Exception as exc:  # noqa: BLE001
                logger.warning("Education/projects scoring failed for candidate=%s: %s", cand["id"], exc)
                cand["education"] = None
                cand["projects"] = None

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
    education = cand.get("education")             # 0-100 or None
    projects = cand.get("projects")               # 0-100 or None
    exp = experience_match(cand.get("total_yoe"), jd_req) * 100
    role_fit = role_fit_score(embed, rerank)

    # (weight, value) for every factor that is actually available.
    components = [
        (W_ROLE_FIT, role_fit),
        (W_SKILLS, skill),
        (W_EXPERIENCE, exp),
    ]
    if projects is not None:
        components.append((W_PROJECTS, float(projects)))
    if education is not None:
        components.append((W_EDUCATION, float(education)))
    if ai_fluency is not None:
        components.append((W_AI_FLUENCY, float(ai_fluency)))
    if assessment is not None:
        components.append((W_ASSESSMENT, float(assessment)))

    wsum = sum(w for w, _ in components)
    final = sum(w * v for w, v in components) / wsum if wsum else 0.0

    cand["final_score"] = round(final, 2)
    # Derive the recruiter-facing label from the SAME blended score used to
    # rank candidates — previously this came from the LLM's raw assessment
    # sub-score alone, so a candidate could show "Strong Match" while ranking
    # below others with a stronger overall final_score. Confusing in practice.
    cand["recommendation"] = recommendation_for(final)
    cand["final_breakdown"] = {
        "role_fit": round(role_fit, 1),
        "skills": round(skill, 1),
        "experience": round(exp, 1),
        "projects": round(float(projects), 1) if projects is not None else None,
        "education": round(float(education), 1) if education is not None else None,
        "ai_fluency": round(float(ai_fluency), 1) if ai_fluency is not None else None,
        "assessment": round(float(assessment), 1) if assessment is not None else None,
        # raw stage scores retained for storage / debugging
        "embed": round(embed, 1),
        "rerank": round(rerank, 1),
        "weights": {"role_fit": W_ROLE_FIT, "skills": W_SKILLS,
                    "experience": W_EXPERIENCE, "projects": W_PROJECTS,
                    "education": W_EDUCATION, "ai_fluency": W_AI_FLUENCY,
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
            education_score=b.get("education"),
            projects_score=b.get("projects"),
            ai_fluency_score=llm.get("ai_fluency"),
            ai_fluency_note=llm.get("ai_fluency_note"),
            final_score=c["final_score"],
            rank=i,
            recommendation=c.get("recommendation"),
            llm_strengths=json.dumps(llm.get("strengths") or []),
            llm_risks=json.dumps(llm.get("risks") or []),
            llm_summary=llm.get("summary"),
            model_version=MODEL_VERSION,
        ))
    db.commit()
