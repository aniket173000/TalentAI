"""
JD Parsing & Requirement Extraction service (E5-S1).

Orchestrates AI-based parsing of job descriptions into structured JDRequirements,
with hash-based caching to avoid re-parsing unchanged JDs.

Usage (from an async FastAPI endpoint or background task):
    await parse_job_requirements(job_id)

Callers that need to check whether parsing is required before enqueueing:
    if jd_needs_parse(job):
        background_tasks.add_task(parse_job_requirements, job.id)
"""

import hashlib
import json
import logging
from datetime import datetime, timezone

import models
from database import SessionLocal
from services.ai_service import parse_jd_requirements as _ai_parse

logger = logging.getLogger(__name__)

PARSER_VERSION = "1.0"


# ── Helpers ───────────────────────────────────────────────────────────────────

def jd_hash(text: str) -> str:
    """SHA-256 of the JD text — used to detect whether a re-parse is needed."""
    return hashlib.sha256(text.strip().encode()).hexdigest()


def jd_needs_parse(job: models.Job) -> bool:
    """
    Return True when the job's JD hasn't been parsed yet, is in a failed/pending
    state, or the stored hash no longer matches the current JD text.
    """
    if job.jd_parse_status in (None, "failed"):
        return True
    if job.jd_parse_status == "pending":
        return False  # already enqueued — don't double-trigger
    # status == "done": re-parse only if the JD text has changed
    if job.jd_requirements:
        try:
            stored = json.loads(job.jd_requirements)
            return stored.get("jd_hash") != jd_hash(job.jd_text)
        except Exception:
            return True
    return True


def reset_parse_status(job: models.Job) -> None:
    """
    Call this (before db.commit()) when jd_text is edited so the stale
    requirements are invalidated and the router triggers a fresh parse.
    """
    job.jd_requirements = None
    job.jd_parse_status = None
    job.jd_parse_error = None


# ── Background task ───────────────────────────────────────────────────────────

async def parse_job_requirements(job_id: int) -> None:
    """
    Background task: call the AI to parse the JD and persist the result.

    State machine:
      None / failed  → pending  (set synchronously by the trigger before enqueuing)
      pending        → done     (success)
      pending        → failed   (error — jd_parse_error is populated)

    Idempotent: if the JD hasn't changed since the last successful parse, the
    function returns early without an AI call.
    """
    # ── 1. Mark as pending ────────────────────────────────────────────────────
    with SessionLocal() as db:
        job = db.query(models.Job).filter(models.Job.id == job_id).first()
        if not job:
            return
        if not jd_needs_parse(job):
            return
        jd_text = job.jd_text
        job_title = job.title
        job.jd_parse_status = "pending"
        job.jd_parse_error = None
        db.commit()

    # ── 2. Call AI (outside the DB session to avoid long-held connections) ────
    try:
        parsed = await _ai_parse(jd_text, job_title)
    except Exception as exc:
        logger.error("JD parsing failed for job %d: %s", job_id, exc)
        with SessionLocal() as db:
            job = db.query(models.Job).filter(models.Job.id == job_id).first()
            if job:
                job.jd_parse_status = "failed"
                job.jd_parse_error = str(exc)[:500]
                db.commit()
        return

    # ── 3. Stamp metadata and persist ────────────────────────────────────────
    parsed["version"] = PARSER_VERSION
    parsed["jd_hash"] = jd_hash(jd_text)
    parsed["parsed_at"] = datetime.now(timezone.utc).isoformat()

    # Ensure required keys exist (defensive — AI might omit optional fields)
    parsed.setdefault("required_skill_groups", [])
    parsed.setdefault("preferred_skills", [])
    parsed.setdefault("key_responsibilities", [])

    with SessionLocal() as db:
        job = db.query(models.Job).filter(models.Job.id == job_id).first()
        if job:
            job.jd_requirements = json.dumps(parsed)
            job.jd_parse_status = "done"
            job.jd_parse_error = None
            db.commit()
            logger.info(
                "JD requirements parsed for job %d — %d required groups, %d preferred skills",
                job_id,
                len(parsed["required_skill_groups"]),
                len(parsed["preferred_skills"]),
            )
