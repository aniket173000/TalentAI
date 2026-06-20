"""
One-shot data migration: SQLite (talentai.db) -> Postgres (pgvector).

Copies every row from each SQLite table into the matching Postgres table.
Safe and re-runnable:
  * Only columns present in BOTH databases are copied (legacy columns that were
    migrated into extension tables are simply skipped).
  * Tables that exist only in SQLite (e.g. the orphan resume_gaming_analyses)
    are skipped.
  * Legacy duplicate-email users (same person split into role='candidate' and
    role='recruiter' rows) are unified: the LOWER id is canonical, the duplicate
    user row is dropped, and every user-referencing FK is remapped to the
    canonical id. This matches the app's current one-user-many-capabilities model.
  * SQLite integer booleans (0/1) are coerced to real Postgres booleans.
  * INSERT ... ON CONFLICT DO NOTHING absorbs any residual unique collisions.
  * FK ordering is bypassed via session_replication_role=replica (superuser);
    targets are TRUNCATEd first for a clean, re-runnable load.
  * id sequences are reset to MAX(id) afterwards.

Usage:
    ./venv/bin/python migrate_sqlite_to_pg.py
"""
import sqlite3

import psycopg2

SQLITE_PATH = "talentai.db"
PG_DSN = "postgresql://talentai:talentai@localhost:5432/talentai"

# Columns across the schema that reference users.id (for canonical remapping).
USER_FK_COLS = {
    "user_id",
    "candidate_user_id",
    "referrer_user_id",
    "recruiter_id",
}


def main():
    sq = sqlite3.connect(SQLITE_PATH)
    sq.row_factory = sqlite3.Row
    pg = psycopg2.connect(PG_DSN)
    pgc = pg.cursor()

    # ── Build canonical user map from duplicate emails ───────────────────────
    # canonical = MIN(id) per email; higher ids are dropped and remapped.
    canonical_map = {}   # duplicate_id -> canonical_id
    drop_ids = set()
    groups = sq.execute(
        "SELECT GROUP_CONCAT(id) ids FROM users "
        "GROUP BY LOWER(email) HAVING COUNT(*) > 1"
    ).fetchall()
    for g in groups:
        ids = sorted(int(x) for x in g["ids"].split(","))
        canonical = ids[0]
        for dup in ids[1:]:
            canonical_map[dup] = canonical
            drop_ids.add(dup)
    print(f"Unifying {len(drop_ids)} duplicate user row(s): {canonical_map or '{}'}")

    def remap(col, val):
        if col in USER_FK_COLS and val in canonical_map:
            return canonical_map[val]
        return val

    # ── Schema introspection helpers ─────────────────────────────────────────
    pgc.execute(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
    )
    pg_tables = [r[0] for r in pgc.fetchall()]
    sqlite_tables = {
        r[0]
        for r in sq.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }

    def pg_cols(table):
        pgc.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name=%s",
            (table,),
        )
        return [r[0] for r in pgc.fetchall()]

    def pg_bool_cols(table):
        pgc.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name=%s AND data_type='boolean'",
            (table,),
        )
        return {r[0] for r in pgc.fetchall()}

    # Bypass FK/triggers during bulk load (docker POSTGRES_USER is a superuser).
    pgc.execute("SET session_replication_role = replica")
    for t in pg_tables:
        pgc.execute(f'TRUNCATE TABLE "{t}" RESTART IDENTITY CASCADE')

    skipped, summary = [], []

    for t in pg_tables:
        if t not in sqlite_tables:
            skipped.append(f"{t} (not in SQLite)")
            continue

        sq_cols = {r[1] for r in sq.execute(f"PRAGMA table_info({t})")}
        cols = [c for c in pg_cols(t) if c in sq_cols]
        if not cols:
            skipped.append(f"{t} (no shared columns)")
            continue

        bool_cols = pg_bool_cols(t)
        rows = sq.execute(f'SELECT {", ".join(cols)} FROM "{t}"').fetchall()

        cols_sql = ", ".join(f'"{c}"' for c in cols)
        placeholders = ", ".join(["%s"] * len(cols))
        insert_sql = (
            f'INSERT INTO "{t}" ({cols_sql}) VALUES ({placeholders}) '
            f"ON CONFLICT DO NOTHING"
        )

        inserted = 0
        for row in rows:
            # Drop unified duplicate user rows from the users table itself.
            if t == "users" and row["id"] in drop_ids:
                continue
            rec = []
            for c in cols:
                v = row[c]
                v = remap(c, v)
                if c in bool_cols and v is not None:
                    v = bool(v)
                rec.append(v)
            pgc.execute(insert_sql, rec)
            inserted += pgc.rowcount
        summary.append((t, inserted, len(rows)))

    pgc.execute("SET session_replication_role = DEFAULT")

    # Reset id sequences so future inserts don't collide.
    for t, _, _ in summary:
        pgc.execute(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name=%s AND column_name='id'",
            (t,),
        )
        if pgc.fetchone():
            pgc.execute(
                f"SELECT setval(pg_get_serial_sequence('\"{t}\"', 'id'), "
                f"COALESCE((SELECT MAX(id) FROM \"{t}\"), 1), true)"
            )

    pg.commit()

    print("=== Rows migrated (inserted / source) ===")
    for t, ins, src in summary:
        flag = "" if ins == src else f"  <- {src - ins} skipped"
        print(f"  {t:28s} {ins}/{src}{flag}")
    if skipped:
        print("=== Tables skipped ===")
        for s in skipped:
            print(f"  {s}")
    print("DONE")


if __name__ == "__main__":
    main()
