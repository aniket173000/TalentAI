"""
Materialise the platform candidate base into the searchable `candidates` table.

Ingestion (LLM extract + embed) is DECOUPLED from ranking so it never runs
inline at 100k scale:

  * prepare_candidate(user_id)  — one candidate, fired on resume upload.
  * bulk_ingest(db)             — concurrent backfill of everyone not yet
                                  materialised (for an initial mass import).
  * sync_new_candidates(db)     — cheap incremental top-up used by the funnel:
                                  ingests only un-materialised candidates, and
                                  only if there are few (else defers to bulk).

At steady state every candidate is already materialised, so the funnel's sync
is a single COUNT query returning 0 — ranking stays O(top_k), not O(corpus).
"""
import asyncio
import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

import models
from database import SessionLocal
from services.candidate_ingest import ingest_resume

logger = logging.getLogger(__name__)

# If a rank finds more than this many un-materialised candidates, it does NOT
# ingest them inline (that would be slow) — it ranks what's ready and logs a
# hint to run the bulk job. Keeps the rank path fast and predictable.
MAX_INLINE_SYNC = 25


def _unmaterialised(db: Session, limit: int | None = None) -> list[tuple[int, str]]:
    """Candidate users with a resume but no `candidates` row yet."""
    q = (
        "SELECT ce.user_id, ce.resume_text "
        "FROM candidate_extensions ce "
        "LEFT JOIN candidates c ON c.user_id = ce.user_id "
        "WHERE ce.resume_text IS NOT NULL AND ce.resume_text <> '' AND c.id IS NULL"
    )
    if limit:
        q += f" LIMIT {int(limit)}"
    return [(r[0], r[1]) for r in db.execute(text(q)).fetchall()]


async def prepare_candidate(user_id: int) -> None:
    """Background task: pre-build one candidate's rankable profile after upload."""
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


async def sync_new_candidates(db: Session, max_inline: int = MAX_INLINE_SYNC) -> dict:
    """
    Incremental top-up for the funnel. Ingests un-materialised candidates inline
    only when there are few; otherwise defers to the bulk job so a rank never
    triggers a mass extraction.
    """
    pending = _unmaterialised(db)
    if not pending:
        return {"materialised": 0, "deferred": 0}
    if len(pending) > max_inline:
        logger.warning(
            "%d candidates not materialised — skipping inline sync. Run bulk_ingest.",
            len(pending),
        )
        return {"materialised": 0, "deferred": len(pending)}
    for user_id, resume_text in pending:
        try:
            await ingest_resume(db, None, resume_text, source="platform", user_id=user_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("sync_new_candidates failed for user=%s: %s", user_id, exc)
    return {"materialised": len(pending), "deferred": 0}


async def bulk_ingest(db: Session, concurrency: int = 8, limit: int | None = None) -> dict:
    """
    Concurrently materialise every un-materialised candidate. Use for an initial
    mass import (e.g. 100k resumes). Idempotent — safe to re-run; already-ingested
    candidates are skipped by the WHERE NOT EXISTS query.
    """
    pending = _unmaterialised(db, limit=limit)
    total = len(pending)
    if not total:
        return {"ingested": 0, "total": 0}

    sem = asyncio.Semaphore(concurrency)
    done = {"n": 0}

    async def _one(user_id: int, resume_text: str):
        async with sem:
            # Each task gets its own session — they run concurrently.
            d = SessionLocal()
            try:
                await ingest_resume(d, None, resume_text, source="platform", user_id=user_id)
                done["n"] += 1
                if done["n"] % 100 == 0:
                    logger.info("bulk_ingest progress: %d/%d", done["n"], total)
            except Exception as exc:  # noqa: BLE001
                logger.warning("bulk_ingest failed for user=%s: %s", user_id, exc)
            finally:
                d.close()

    await asyncio.gather(*[_one(uid, rt) for uid, rt in pending])
    logger.info("bulk_ingest complete: %d/%d materialised", done["n"], total)
    return {"ingested": done["n"], "total": total}
