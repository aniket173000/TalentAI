"""
Backfill pgvector columns from the canonical TEXT (JSON) embedding columns.

  candidates.profile_embedding (TEXT) -> candidates.profile_vec (vector)
  jobs.jd_embedding            (TEXT) -> jobs.jd_vec        (vector)

Idempotent: only fills rows where the vector column is NULL and a TEXT embedding
exists. Safe to re-run.

Usage:
    ./venv/bin/python backfill_vectors.py
"""
import json

from sqlalchemy import text

from database import SessionLocal
from services.pgvector_sync import to_vector_literal


JOBS = [
    ("candidates", "profile_embedding", "profile_vec"),
    ("jobs", "jd_embedding", "jd_vec"),
]


def main():
    db = SessionLocal()
    try:
        for table, text_col, vec_col in JOBS:
            rows = db.execute(
                text(
                    f"SELECT id, {text_col} FROM {table} "
                    f"WHERE {text_col} IS NOT NULL AND {vec_col} IS NULL"
                )
            ).fetchall()
            filled = skipped = 0
            for row_id, raw in rows:
                try:
                    emb = json.loads(raw)
                except Exception:
                    skipped += 1
                    continue
                if not emb or not isinstance(emb, list):
                    skipped += 1
                    continue
                db.execute(
                    text(f"UPDATE {table} SET {vec_col} = (:vec)::vector WHERE id = :id"),
                    {"vec": to_vector_literal(emb), "id": row_id},
                )
                filled += 1
            db.commit()
            print(f"{table}.{vec_col}: filled={filled} skipped={skipped} (of {len(rows)} candidates)")
        print("DONE")
    finally:
        db.close()


if __name__ == "__main__":
    main()
