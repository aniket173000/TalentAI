"""
CompositeScorer — orchestrates all four sub-scorers and persists the result.

Single responsibility: orchestration and DB persistence.
Each sub-scorer lives in its own module.

Pipeline:
  1. Validate inputs (profile has data, JD is parsed).
  2. Check idempotency — if inputs_hash already exists, return cached record.
  3. Run all four sub-scorers concurrently (asyncio.gather).
  4. Sum sub-scores → composite (0–100).
  5. Persist to candidate_job_scores — old records retained (immutable history).
  6. Return CompositeScoreResult.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

from sqlalchemy.orm import Session

from services.composite.hasher import InputHasher
from services.composite.models import SCORING_MODEL_VERSION, CompositeScoreResult

logger = logging.getLogger(__name__)


class CompositeScorer:
    """
    Async scorer + DB writer.  Instantiate once as a module-level singleton.
    """

    def __init__(self, hasher: InputHasher | None = None) -> None:
        self._hasher = hasher or InputHasher()

    # ── Public ────────────────────────────────────────────────────────────────

    async def compute_and_store(
        self,
        application_id: int,
        job_id: int,
        db: Session,
    ) -> CompositeScoreResult:
        """
        Compute the composite score for one candidate-job pair and persist it.

        Steps:
          1. Fetch CandidateProfile (latest for this application).
          2. Fetch Job + parsed JD requirements.
          3. Check idempotency cache.
          4. Run all four sub-scorers concurrently.
          5. Store and return.
        """
        import models as _models  # local import to avoid circular deps at module load

        # ── 1. Fetch profile ───────────────────────────────────────────────────
        profile = (
            db.query(_models.CandidateProfile)
            .filter(_models.CandidateProfile.application_id == application_id)
            .order_by(_models.CandidateProfile.extracted_at.desc())
            .first()
        )
        if not profile:
            raise ValueError(
                f"No CandidateProfile found for application {application_id}. "
                "Run resume extraction first."
            )

        # ── 2. Fetch job ───────────────────────────────────────────────────────
        job = db.query(_models.Job).filter(_models.Job.id == job_id).first()
        if not job:
            raise ValueError(f"Job {job_id} not found.")

        if job.jd_parse_status != "done" or not job.jd_requirements:
            raise ValueError(
                f"JD requirements not yet parsed for job {job_id}. "
                "Trigger via POST /api/jobs/{job_id}/parse-requirements."
            )

        jd_requirements = json.loads(job.jd_requirements)

        # ── 3. Idempotency check ───────────────────────────────────────────────
        inputs_hash = self._hasher.compute(
            model_version=SCORING_MODEL_VERSION,
            candidate_profile_id=profile.id,
            source_resume_hash=profile.source_resume_hash,
            job_id=job_id,
            jd_requirements_json=job.jd_requirements,
        )

        existing = (
            db.query(_models.CandidateJobScore)
            .filter(
                _models.CandidateJobScore.application_id == application_id,
                _models.CandidateJobScore.job_id == job_id,
                _models.CandidateJobScore.inputs_hash == inputs_hash,
            )
            .first()
        )
        if existing:
            return self._from_db_record(existing, from_cache=True)

        # ── 4. Run all four sub-scorers concurrently ────────────────────────────
        result = await self._run_all_scorers(profile, job, jd_requirements)
        result.inputs_hash = inputs_hash
        result.candidate_profile_id = profile.id
        result.application_id = application_id
        result.job_id = job_id

        # ── 5. Persist ─────────────────────────────────────────────────────────
        record = _models.CandidateJobScore(
            application_id=application_id,
            job_id=job_id,
            candidate_profile_id=profile.id,
            model_version=SCORING_MODEL_VERSION,
            skills_score=result.skills_score,
            experience_score=result.experience_score,
            education_score=result.education_score,
            projects_score=result.projects_score,
            composite_score=result.composite_score,
            breakdown=json.dumps({
                "skills": result.skills_breakdown,
                "experience": result.experience_breakdown,
                "education": result.education_breakdown,
                "projects": result.projects_breakdown,
            }),
            inputs_hash=inputs_hash,
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        logger.info(
            "CompositeScore stored: app=%s job=%s score=%.1f hash=%s...",
            application_id, job_id, result.composite_score, inputs_hash[:8],
        )
        return result

    def load_latest(
        self, application_id: int, job_id: int, db: Session
    ) -> Optional[CompositeScoreResult]:
        """
        Load the most recent composite score record for this candidate-job pair.
        Returns None if no record exists.
        """
        import models as _models

        record = (
            db.query(_models.CandidateJobScore)
            .filter(
                _models.CandidateJobScore.application_id == application_id,
                _models.CandidateJobScore.job_id == job_id,
            )
            .order_by(_models.CandidateJobScore.scored_at.desc())
            .first()
        )
        if not record:
            return None
        return self._from_db_record(record, from_cache=True)

    def load_history(
        self, application_id: int, job_id: int, db: Session
    ) -> list[dict]:
        """
        Load all score records for this candidate-job pair, newest first.
        """
        import models as _models

        records = (
            db.query(_models.CandidateJobScore)
            .filter(
                _models.CandidateJobScore.application_id == application_id,
                _models.CandidateJobScore.job_id == job_id,
            )
            .order_by(_models.CandidateJobScore.scored_at.desc())
            .all()
        )
        return [
            {
                "id": r.id,
                "composite_score": r.composite_score,
                "skills_score": r.skills_score,
                "experience_score": r.experience_score,
                "education_score": r.education_score,
                "projects_score": r.projects_score,
                "model_version": r.model_version,
                "scored_at": r.scored_at.isoformat() if r.scored_at else None,
                "inputs_hash": r.inputs_hash,
            }
            for r in records
        ]

    # ── Private ───────────────────────────────────────────────────────────────

    async def _run_all_scorers(
        self,
        profile,       # CandidateProfile ORM object
        job,           # Job ORM object
        jd_requirements: dict,
    ) -> CompositeScoreResult:
        """
        Run all four sub-scorers concurrently using asyncio.gather.

        Experience scoring is synchronous but wrapped in a coroutine
        so gather() can schedule it alongside the async scorers.
        """
        from services.education import score_education
        from services.experience import score_experience
        from services.projects import score_projects
        from services.semantic import score_skills

        # Parse JSON blobs once
        work_history = _safe_json(profile.work_history, [])
        education_entries = _safe_json(profile.education, [])
        certifications = _safe_json(profile.certifications, [])
        projects = _safe_json(profile.projects, [])
        normalized_skills: list[str] = _safe_json(profile.normalized_skills, [])
        raw_skills: list[str] = _safe_json(profile.raw_skills, [])
        candidate_skills = normalized_skills or raw_skills

        skill_groups = jd_requirements.get("required_skill_groups", [])

        async def _experience_coro():
            return score_experience(
                work_history=work_history,
                total_yoe=profile.total_yoe,
                jd_requirements=jd_requirements,
            )

        skills_bd, exp_bd, edu_bd, proj_bd = await asyncio.gather(
            score_skills(candidate_skills, skill_groups),
            _experience_coro(),
            score_education(education_entries, certifications, jd_requirements),
            score_projects(projects, job.title, jd_requirements),
        )

        composite = min(
            100.0,
            skills_bd.score + exp_bd.score + edu_bd.score + proj_bd.score,
        )

        return CompositeScoreResult(
            composite_score=round(composite, 2),
            skills_score=round(skills_bd.score, 2),
            experience_score=round(exp_bd.score, 2),
            education_score=round(edu_bd.score, 2),
            projects_score=round(proj_bd.score, 2),
            skills_breakdown=skills_bd.to_dict(),
            experience_breakdown=exp_bd.to_dict(),
            education_breakdown=edu_bd.to_dict(),
            projects_breakdown=proj_bd.to_dict(),
            model_version=SCORING_MODEL_VERSION,
        )

    @staticmethod
    def _from_db_record(record, *, from_cache: bool) -> CompositeScoreResult:
        breakdown = _safe_json(record.breakdown, {})
        return CompositeScoreResult(
            composite_score=record.composite_score,
            skills_score=record.skills_score or 0.0,
            experience_score=record.experience_score or 0.0,
            education_score=record.education_score or 0.0,
            projects_score=record.projects_score or 0.0,
            skills_breakdown=breakdown.get("skills", {}),
            experience_breakdown=breakdown.get("experience", {}),
            education_breakdown=breakdown.get("education", {}),
            projects_breakdown=breakdown.get("projects", {}),
            model_version=record.model_version,
            inputs_hash=record.inputs_hash,
            candidate_profile_id=record.candidate_profile_id,
            application_id=record.application_id,
            job_id=record.job_id,
            from_cache=from_cache,
        )


def _safe_json(raw, default):
    if not raw:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default
