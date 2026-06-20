"""
Candidate search / ranking — Stage 1 of the retrieval funnel.

  GET /api/search/candidates?job_id=&top_k=
      Rank the recruiter's corpus against a job via pgvector ANN + hybrid score.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

import models
from database import get_db
import json

from routers.auth import require_recruiter
from services.funnel import start_ranking_run
from services.reranker import rerank_candidates
from services.retrieval import retrieve_candidates

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("/candidates", summary="Rank corpus candidates against a job (top K)")
async def search_candidates(
    job_id: int = Query(...),
    top_k: int = Query(500, ge=1, le=1000),
    recruiter: models.User = Depends(require_recruiter),
    db: Session = Depends(get_db),
):
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    if job.recruiter_id is not None and job.recruiter_id != recruiter.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your job.")

    ranked = await retrieve_candidates(db, job, recruiter.id, top_k=top_k)
    return {
        "job_id": job.id,
        "job_title": job.title,
        "stage": "retrieval",
        "weights": {"vector": 0.70, "skill_match": 0.20, "keyword_match": 0.10},
        "count": len(ranked),
        "candidates": ranked,
    }


@router.get("/candidates/ranked",
            summary="Retrieve + cross-encoder rerank (top_k -> top_n)")
async def search_candidates_ranked(
    job_id: int = Query(...),
    top_k: int = Query(500, ge=1, le=1000, description="retrieval pool size"),
    top_n: int = Query(50, ge=1, le=200, description="candidates kept after reranking"),
    recruiter: models.User = Depends(require_recruiter),
    db: Session = Depends(get_db),
):
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    if job.recruiter_id is not None and job.recruiter_id != recruiter.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your job.")

    retrieved = await retrieve_candidates(db, job, recruiter.id, top_k=top_k)
    reranked = rerank_candidates(db, job, retrieved, top_n=top_n)
    return {
        "job_id": job.id,
        "job_title": job.title,
        "stage": "rerank",
        "retrieved": len(retrieved),
        "count": len(reranked),
        "candidates": reranked,
    }


def _job_or_403(job_id: int, recruiter: models.User, db: Session) -> models.Job:
    job = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    if job.recruiter_id is not None and job.recruiter_id != recruiter.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your job.")
    return job


@router.post("/candidates/evaluate", status_code=status.HTTP_202_ACCEPTED,
             summary="Start the full ranking funnel as a background job")
def evaluate(
    job_id: int = Query(...),
    top_k: int = Query(500, ge=1, le=1000, description="retrieval pool"),
    rerank_n: int = Query(50, ge=1, le=200, description="kept after reranking"),
    eval_n: int = Query(20, ge=1, le=50, description="candidates sent to the LLM"),
    recruiter: models.User = Depends(require_recruiter),
    db: Session = Depends(get_db),
):
    job = _job_or_403(job_id, recruiter, db)
    run = start_ranking_run(db, job.id, recruiter.id, top_k=top_k, rerank_n=rerank_n, eval_n=eval_n)
    return {
        "run_id": run.id,
        "job_id": job.id,
        "job_title": job.title,
        "status": run.status,
        "poll": f"/api/search/runs/{run.id}",
        "results": f"/api/search/rankings?job_id={job.id}",
    }


@router.get("/runs/{run_id}", summary="Poll the status of a ranking run")
def get_run(
    run_id: int,
    recruiter: models.User = Depends(require_recruiter),
    db: Session = Depends(get_db),
):
    run = db.get(models.RankingRun, run_id)
    if not run or run.recruiter_id != recruiter.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")
    return {
        "run_id": run.id,
        "job_id": run.job_id,
        "status": run.status,
        "retrieved": run.retrieved,
        "reranked": run.reranked,
        "evaluated": run.evaluated,
        "error": run.error,
        "created_at": run.created_at,
        "completed_at": run.completed_at,
    }


@router.get("/rankings", summary="Read the stored ranking set for a job")
def get_rankings(
    job_id: int = Query(...),
    recruiter: models.User = Depends(require_recruiter),
    db: Session = Depends(get_db),
):
    _job_or_403(job_id, recruiter, db)
    rows = (
        db.query(models.CandidateRanking)
        .filter(models.CandidateRanking.job_id == job_id)
        .order_by(models.CandidateRanking.rank.asc())
        .all()
    )
    out = []
    for r in rows:
        cand = r.candidate
        out.append({
            "rank": r.rank,
            "candidate_id": r.candidate_id,
            "full_name": cand.full_name if cand else None,
            "headline": cand.headline if cand else None,
            "final_score": r.final_score,
            "recommendation": r.recommendation,
            "breakdown": {
                "embed": r.embed_score, "skill": r.skill_score,
                "keyword": r.keyword_score, "rerank": r.rerank_score,
                "llm": r.llm_score, "experience": r.experience_score,
            },
            "llm_strengths": json.loads(r.llm_strengths or "[]"),
            "llm_risks": json.loads(r.llm_risks or "[]"),
            "llm_summary": r.llm_summary,
            "ranked_at": r.ranked_at,
        })
    return {"job_id": job_id, "model_version": rows[0].model_version if rows else None,
            "count": len(out), "rankings": out}
