"""
Orchestrator for resume gaming detection.
Runs as a background task after every reapplication.
"""
import asyncio
import json
import logging

import models
from database import SessionLocal
from services.gaming.skill_diff import compute_skill_diff
from services.gaming.claim_verifier import verify_skill_claims
from services.gaming.drift_detector import compute_drift

logger = logging.getLogger(__name__)


def _risk_level(score: float) -> str:
    if score >= 0.75:
        return "high"
    if score >= 0.50:
        return "medium"
    if score >= 0.25:
        return "low"
    return "none"


def _get_skills(db, app_id: int, resume_text: str) -> list[str]:
    """Return normalized skills for an application. Falls back to raw resume parsing."""
    profile = (
        db.query(models.CandidateProfile)
        .filter(models.CandidateProfile.application_id == app_id)
        .order_by(models.CandidateProfile.extracted_at.desc())
        .first()
    )
    if profile and profile.normalized_skills:
        try:
            return json.loads(profile.normalized_skills)
        except Exception:
            pass
    if profile and profile.raw_skills:
        try:
            return json.loads(profile.raw_skills)
        except Exception:
            pass
    # Last resort: no profile available
    return []


async def analyze_reapplication(
    new_app_id: int,
    prev_app_id: int,
    job_id: int,
    new_resume_text: str,
    prev_resume_text: str,
) -> None:
    """
    Runs all three gaming-detection signals and persists a ResumeGamingAnalysis row.
    Designed to be called as a background task — never raises.
    """
    try:
        with SessionLocal() as db:
            job = db.query(models.Job).filter(models.Job.id == job_id).first()
            prev_app = db.query(models.Application).filter(models.Application.id == prev_app_id).first()

            if not job or not prev_app:
                logger.warning("analyze_reapplication: missing job or prev_app, skipping")
                return

            new_skills = _get_skills(db, new_app_id, new_resume_text)
            prev_skills = _get_skills(db, prev_app_id, prev_resume_text)
            prev_gaps = json.loads(prev_app.gaps or "[]")

        # Run all three checks concurrently (I/O bound — all involve embeddings or LLM)
        diff_task = compute_skill_diff(new_skills, prev_skills, prev_gaps)
        drift_task = compute_drift(new_resume_text, prev_resume_text, job.jd_text)
        diff_result, drift_result = await asyncio.gather(diff_task, drift_task)

        # Claim verification only runs when there are newly added skills
        added = diff_result["added_skills"]
        if added:
            claim_result = await verify_skill_claims(added, new_resume_text)
        else:
            claim_result = {"skill_evidence": {}, "unsupported_skills": []}

        # Composite risk score
        gap_exploit = diff_result["gap_exploit_ratio"]  # 0.0–1.0

        n_added = len(added)
        n_unsupported = len(claim_result["unsupported_skills"])
        unsupported_ratio = n_unsupported / n_added if n_added else 0.0

        delta = drift_result.get("similarity_delta") or 0.0
        drift_signal = min(1.0, max(0.0, delta * 5))  # 0.2 delta maps to 1.0

        gaming_risk_score = (
            gap_exploit * 0.40
            + unsupported_ratio * 0.40
            + drift_signal * 0.20
        )

        with SessionLocal() as db:
            analysis = models.ResumeGamingAnalysis(
                application_id=new_app_id,
                prev_application_id=prev_app_id,
                added_skills=json.dumps(diff_result["added_skills"]),
                skills_overlap_gaps=json.dumps(diff_result["skills_overlap_gaps"]),
                gap_exploit_ratio=diff_result["gap_exploit_ratio"],
                unsupported_skills=json.dumps(claim_result["unsupported_skills"]),
                skill_evidence=json.dumps(claim_result["skill_evidence"]),
                resume_jd_similarity=drift_result.get("resume_jd_similarity"),
                prev_resume_jd_similarity=drift_result.get("prev_resume_jd_similarity"),
                similarity_delta=drift_result.get("similarity_delta"),
                resume_self_similarity=drift_result.get("resume_self_similarity"),
                gaming_risk_score=round(gaming_risk_score, 4),
                risk_level=_risk_level(gaming_risk_score),
            )
            db.add(analysis)
            db.commit()
            logger.info(
                "Gaming analysis for app %d: risk=%s (%.2f)",
                new_app_id,
                analysis.risk_level,
                gaming_risk_score,
            )

    except Exception as exc:
        logger.warning("analyze_reapplication failed for app %d: %s", new_app_id, exc)
