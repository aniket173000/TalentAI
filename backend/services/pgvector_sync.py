"""
Helpers to keep the Postgres pgvector columns in sync with the canonical TEXT
embedding columns. No-ops on non-Postgres engines (the vector columns only
exist on Postgres), so callers can invoke unconditionally.
"""
import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

from config import settings

logger = logging.getLogger(__name__)

_IS_POSTGRES = settings.DATABASE_URL.startswith("postgres")


def to_vector_literal(embedding: list[float]) -> str:
    """pgvector text literal, e.g. '[0.1,0.2,0.3]'."""
    return "[" + ",".join(repr(float(x)) for x in embedding) + "]"


def sync_vector(db: Session, table: str, column: str, row_id: int, embedding: list[float]) -> None:
    """
    Write `embedding` into a pgvector column. Best-effort: logs and swallows
    errors so embedding sync never breaks the primary write path.
    """
    if not _IS_POSTGRES or not embedding:
        return
    try:
        db.execute(
            text(f"UPDATE {table} SET {column} = (:vec)::vector WHERE id = :id"),
            {"vec": to_vector_literal(embedding), "id": row_id},
        )
        db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Vector sync failed for %s.%s id=%s: %s", table, column, row_id, exc)
        db.rollback()
