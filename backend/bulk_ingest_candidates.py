"""
Concurrently materialise the platform candidate base into the `candidates`
table (LLM extract → profile summary → embedding). Run this once after a mass
resume import so the ranking funnel never has to extract inline.

Idempotent — already-materialised candidates are skipped. Safe to re-run.

Usage:
    ./venv/bin/python bulk_ingest_candidates.py [concurrency] [limit]
"""
import asyncio
import sys

from database import SessionLocal
from services.corpus_sync import bulk_ingest


async def main():
    concurrency = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else None
    db = SessionLocal()
    try:
        print(f"Bulk-ingesting candidates (concurrency={concurrency}, limit={limit})…")
        result = await bulk_ingest(db, concurrency=concurrency, limit=limit)
        print(f"DONE — ingested {result['ingested']} / {result['total']} pending candidate(s).")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
