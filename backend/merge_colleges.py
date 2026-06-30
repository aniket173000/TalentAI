"""
One-time backfill: merge duplicate college pages created before name
canonicalisation existed.

For every distinct `user_education.institution_name` it computes the canonical
name (same logic the app now uses on write), then:
  - rewrites education rows to the canonical name,
  - rewrites jobs.campus_college_name,
  - collapses duplicate `colleges` rows into one canonical row (keeping the best
    logo / AI info / website among the duplicates),
  - re-points every UserEducation.college_id at the surviving college.

Safe to re-run. Use --dry-run first to preview the merges.

    python merge_colleges.py --dry-run
    python merge_colleges.py
"""
import argparse
import asyncio
import sys

from database import SessionLocal
import models
from services.college_resolver import canonicalize_college_name


async def build_mapping(db) -> dict[str, str]:
    """raw institution_name -> canonical name, for every distinct raw name."""
    raws = [
        r[0]
        for r in db.query(models.UserEducation.institution_name).distinct().all()
        if r[0] and r[0].strip()
    ]
    mapping: dict[str, str] = {}
    for raw in raws:
        canonical = await canonicalize_college_name(db, raw)
        mapping[raw] = canonical
    db.commit()  # persist the alias cache built along the way
    return mapping


def _pick_best_college(rows: list[models.College], canonical: str) -> models.College:
    """Choose the survivor row (prefer exact canonical name), merge missing fields."""
    survivor = next((r for r in rows if r.name == canonical), None) or rows[0]
    survivor.name = canonical
    for r in rows:
        if r is survivor:
            continue
        if not survivor.short_name and r.short_name:
            survivor.short_name = r.short_name
        if not survivor.logo_url and r.logo_url:
            survivor.logo_url = r.logo_url
        if not survivor.website_url and r.website_url:
            survivor.website_url = r.website_url
        if not survivor.ai_info and r.ai_info:
            survivor.ai_info = r.ai_info
    return survivor


def apply_merge(db, mapping: dict[str, str], dry_run: bool) -> None:
    # Group raw names by their canonical target.
    by_canonical: dict[str, set[str]] = {}
    for raw, canonical in mapping.items():
        by_canonical.setdefault(canonical, set()).add(raw)

    merged_pages = 0
    for canonical, raws in sorted(by_canonical.items()):
        variants = sorted(raws - {canonical})
        ed_count = (
            db.query(models.UserEducation)
            .filter(models.UserEducation.institution_name.in_(list(raws)))
            .count()
        )
        if variants:
            merged_pages += 1
            print(f"  • {canonical!r}  ⇐  {variants}  ({ed_count} education rows)")
        elif raws != {canonical}:
            print(f"  • {canonical!r}  (normalised)")

        if dry_run:
            continue

        # 1. Rewrite education + jobs to the canonical name.
        for raw in raws:
            if raw == canonical:
                continue
            db.query(models.UserEducation).filter(
                models.UserEducation.institution_name == raw
            ).update({"institution_name": canonical}, synchronize_session=False)
            db.query(models.Job).filter(
                models.Job.campus_college_name == raw
            ).update({"campus_college_name": canonical}, synchronize_session=False)

        # 2. Collapse college rows for this group.
        college_rows = (
            db.query(models.College)
            .filter(models.College.name.in_(list(raws)))
            .all()
        )
        if college_rows:
            survivor = _pick_best_college(college_rows, canonical)
            db.flush()
            for r in college_rows:
                if r.id == survivor.id:
                    continue
                db.query(models.UserEducation).filter(
                    models.UserEducation.college_id == r.id
                ).update({"college_id": survivor.id}, synchronize_session=False)
                db.delete(r)
            # Point every education row for this college at the survivor.
            db.query(models.UserEducation).filter(
                models.UserEducation.institution_name == canonical
            ).update({"college_id": survivor.id}, synchronize_session=False)

    if not dry_run:
        db.commit()

    print(f"\n{'Would merge' if dry_run else 'Merged'} {merged_pages} duplicate college page(s).")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        print("Resolving canonical names (may call the AI for new spellings)…")
        mapping = await build_mapping(db)
        print(f"Resolved {len(mapping)} distinct college name(s).\n")
        apply_merge(db, mapping, args.dry_run)
    finally:
        db.close()


if __name__ == "__main__":
    if "--help" in sys.argv or "-h" in sys.argv:
        print(__doc__)
    asyncio.run(main())
