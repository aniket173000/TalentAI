"""
Candidate corpus ingestion (pull-side funnel).

Turns a raw resume into a searchable `Candidate` row:
    parse (caller) -> LLM structured extract -> skill normalisation
    -> profile summary -> embedding -> persist.

The PRD is explicit: DO NOT embed the entire resume. We embed a compact,
structured *profile summary* built from the extracted fields. The heavy work is
isolated in `ingest_resume` so it can later be moved to a queue/batch worker for
bulk ingestion without changing callers.
"""
import hashlib
import json
import logging
from typing import Optional

from sqlalchemy.orm import Session

import models
from services.ai_service import extract_structured_profile, get_embedding
from services.pgvector_sync import sync_vector
from services.skills_normalizer import normalize_skills

logger = logging.getLogger(__name__)


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _first(d: dict, *keys):
    """Return the first non-empty value among the given keys of a dict."""
    for k in keys:
        v = d.get(k)
        if v:
            return v
    return None


def build_profile_summary(profile: dict, normalized_skills: list[str]) -> str:
    """
    Compact structured blurb used as the embedding input (NOT the full resume).

    Example:
        Senior Backend Engineer
        Skills: Golang, Kafka, AWS, PostgreSQL
        Experience: 3.0 years
        Industries: Fintech, Payments
        Projects: Payment Gateway, Distributed Ledger
        Education: B.Tech Computer Science
    """
    lines: list[str] = []

    work = profile.get("work_history") or []
    # Title line: most recent role title, else headline.
    title = None
    if work and isinstance(work[0], dict):
        title = _first(work[0], "title", "role", "position")
    title = title or profile.get("headline")
    if title:
        lines.append(str(title))

    if normalized_skills:
        lines.append("Skills: " + ", ".join(normalized_skills[:20]))

    yoe = profile.get("total_yoe")
    if yoe is not None:
        lines.append(f"Experience: {yoe} years")

    # Industries / domains from work history.
    industries: list[str] = []
    for w in work:
        if isinstance(w, dict):
            dom = _first(w, "industry", "domain")
            comp = _first(w, "company", "employer")
            if dom and dom not in industries:
                industries.append(str(dom))
            elif comp and comp not in industries:
                industries.append(str(comp))
    if industries:
        lines.append("Industries: " + ", ".join(industries[:5]))

    projects = profile.get("projects") or []
    proj_names: list[str] = []
    for p in projects:
        if isinstance(p, dict):
            name = _first(p, "name", "title", "project_name")
        else:
            name = p
        if name:
            proj_names.append(str(name))
    if proj_names:
        lines.append("Projects: " + ", ".join(proj_names[:6]))

    education = profile.get("education") or []
    edu_strs: list[str] = []
    for e in education:
        if isinstance(e, dict):
            deg = _first(e, "degree", "degree_type", "qualification")
            field = _first(e, "field", "field_of_study", "major")
            edu_strs.append(" ".join(x for x in (deg, field) if x))
        elif e:
            edu_strs.append(str(e))
    edu_strs = [s for s in edu_strs if s]
    if edu_strs:
        lines.append("Education: " + "; ".join(edu_strs[:3]))

    return "\n".join(lines)


async def ingest_resume(
    db: Session,
    recruiter_id: Optional[int],
    resume_text: str,
    resume_filename: Optional[str] = None,
    resume_file_key: Optional[str] = None,
    source: str = "upload",
    user_id: Optional[int] = None,
) -> models.Candidate:
    """
    Ingest one resume into the searchable candidate table.

    Two modes:
      * platform candidate (user_id given) — deduped by user_id, one row per user.
      * manual upload (recruiter_id given)  — deduped by (recruiter, resume hash).

    Idempotent: re-ingesting an unchanged resume returns the existing row. On
    extraction/embedding failure the candidate is still persisted (status='failed')
    so the resume is never lost and can be retried.
    """
    resume_hash = sha256(resume_text)

    q = db.query(models.Candidate)
    if user_id is not None:
        existing = (
            q.filter(models.Candidate.user_id == user_id)
            .order_by(models.Candidate.created_at.desc()).first()
        )
        # Re-ingest if the user's resume changed since last sync.
        if existing and existing.source_resume_hash == resume_hash:
            return existing
        if existing:
            db.delete(existing)
            db.commit()
    else:
        existing = (
            q.filter(
                models.Candidate.recruiter_id == recruiter_id,
                models.Candidate.source_resume_hash == resume_hash,
            )
            .order_by(models.Candidate.created_at.desc()).first()
        )
        if existing:
            logger.info("Corpus dedup hit: recruiter=%s hash=%s -> candidate=%d",
                        recruiter_id, resume_hash[:8], existing.id)
            return existing

    candidate = models.Candidate(
        recruiter_id=recruiter_id,
        user_id=user_id,
        source=source,
        source_resume_hash=resume_hash,
        resume_text=resume_text,
        resume_filename=resume_filename,
        resume_file_key=resume_file_key,
        ingest_status="parsing",
    )

    await _extract_into(db, candidate, resume_text)
    logger.info(
        "Ingested candidate id=%d recruiter=%s status=%s",
        candidate.id, recruiter_id, candidate.ingest_status,
    )
    return candidate


async def _extract_into(db: Session, candidate: models.Candidate, resume_text: str) -> models.Candidate:
    """Run structured extraction + embedding and populate `candidate` IN PLACE.

    Works for both brand-new rows (not yet persisted) and existing rows being
    re-parsed — it never deletes the row, so foreign-key references (e.g.
    candidate_rankings) stay intact and the candidate id is preserved.
    """
    embedding: Optional[list[float]] = None
    try:
        raw = await extract_structured_profile(resume_text)
        raw_skills: list[str] = raw.get("raw_skills") or []
        normalized, unmapped, taxonomy_version = normalize_skills(raw_skills)
        summary = build_profile_summary(raw, normalized)
        embedding = await get_embedding(summary) if summary else None

        work = raw.get("work_history") or []
        headline = None
        if work and isinstance(work[0], dict):
            headline = _first(work[0], "title", "role", "position")

        candidate.full_name = raw.get("full_name")
        candidate.email = raw.get("email")
        candidate.phone = raw.get("phone")
        candidate.location = raw.get("location")
        candidate.headline = headline
        candidate.total_yoe = raw.get("total_yoe")
        candidate.work_history = json.dumps(work)
        candidate.raw_skills = json.dumps(raw_skills)
        candidate.normalized_skills = json.dumps(normalized)
        candidate.unmapped_skills = json.dumps(unmapped)
        candidate.education = json.dumps(raw.get("education") or [])
        candidate.projects = json.dumps(raw.get("projects") or [])
        candidate.certifications = json.dumps(raw.get("certifications") or [])
        candidate.taxonomy_version = taxonomy_version
        candidate.profile_summary = summary
        candidate.profile_embedding = json.dumps(embedding) if embedding else None
        candidate.ingest_status = "ready"
        candidate.ingest_error = None
    except Exception as exc:  # noqa: BLE001 — keep the resume, mark failed for retry
        logger.error("Candidate extraction failed (candidate=%s): %s", candidate.id, exc)
        candidate.ingest_status = "failed"
        candidate.ingest_error = str(exc)[:1000]

    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    # Mirror the embedding into the pgvector column for ANN retrieval (Postgres).
    if embedding:
        sync_vector(db, "candidates", "profile_vec", candidate.id, embedding)

    return candidate


async def reparse_candidate(db: Session, candidate: models.Candidate) -> models.Candidate:
    """Re-run extraction on an already-ingested candidate's stored resume, updating
    the row in place (id and all FK references preserved)."""
    candidate.ingest_status = "parsing"
    db.add(candidate)
    db.commit()
    result = await _extract_into(db, candidate, candidate.resume_text or "")
    logger.info("Re-parsed candidate id=%d status=%s", result.id, result.ingest_status)
    return result
