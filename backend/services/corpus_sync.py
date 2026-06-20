"""
Sync the platform candidate base into the searchable `candidates` table.

Candidates register and store a resume on their CandidateExtension. This
materialises each of them into a `candidate` row (source='platform') via the
normal ingest pipeline (parse → structured extract → profile summary → embed),
so the ranking funnel can score the WHOLE candidate base against any job — no
manual upload required.

Idempotent: a candidate whose resume is unchanged is skipped; a changed resume
is re-ingested. Cheap after the first run.
"""
import logging

from sqlalchemy.orm import Session

import models
from database import SessionLocal
from services.candidate_ingest import ingest_resume

logger = logging.getLogger(__name__)


async def prepare_candidate(user_id: int) -> None:
    """
    Background task: pre-build a candidate's rankable profile right after they
    upload/change their resume, so the ranking funnel doesn't pay extraction cost
    on the first rank. Opens its own DB session (runs after the request returns).
    Idempotent — ingest_resume skips unchanged resumes.
    """
    db = SessionLocal()
    try:
        ext = (
            db.query(models.CandidateExtension)
            .filter(models.CandidateExtension.user_id == user_id)
            .first()
        )
        if not ext or not ext.resume_text:
            return
        await ingest_resume(db, None, ext.resume_text, source="platform", user_id=user_id)
        logger.info("Pre-built rankable profile for candidate user=%s", user_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("prepare_candidate failed for user=%s: %s", user_id, exc)
    finally:
        db.close()


async def sync_platform_corpus(db: Session) -> dict:
    rows = (
        db.query(models.CandidateExtension.user_id, models.CandidateExtension.resume_text)
        .filter(
            models.CandidateExtension.resume_text.isnot(None),
            models.CandidateExtension.resume_text != "",
        )
        .all()
    )
    ingested = 0
    for user_id, resume_text in rows:
        try:
            await ingest_resume(db, None, resume_text, source="platform", user_id=user_id)
            ingested += 1
        except Exception as exc:  # noqa: BLE001 — one bad resume shouldn't stop the sync
            logger.warning("Platform sync failed for user=%s: %s", user_id, exc)
    logger.info("Platform corpus sync: processed %d candidate(s)", ingested)
    return {"processed": ingested, "total_candidates": len(rows)}
