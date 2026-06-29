"""
Shared company-logo cache.

Company names are free-text scattered across the app (work history, current
company, recruiter affiliation). Resolving a logo for each occurrence
independently is slow and repetitive, so this module centralises it:

  * `normalize_company_name`  — collapse a name to a stable cache key.
  * `get_company_logos`        — batch, cache-only read (never hits the network).
  * `pending_company_names`    — which names have no cache row yet.
  * `resolve_company_logos_task` — background worker: resolve uncached names via
                                   the existing brand resolver and persist them.

Read paths must use the cache-only helpers so HTTP responses never block on the
network; resolution happens in FastAPI background tasks.
"""

import logging
import re

from sqlalchemy.orm import Session

import models

logger = logging.getLogger(__name__)

# Trailing legal/entity tokens stripped so "Stripe Inc" and "Stripe" share a key.
# Kept deliberately small — aggressive stripping over-collapses real names
# (e.g. "Global Payments" must not become "Payments").
_LEGAL_SUFFIXES = {
    "inc", "llc", "ltd", "limited", "pvt", "private", "corp", "corporation",
    "gmbh", "plc", "co", "llp", "sa", "ag", "bv", "srl",
}

_PLACEHOLDERS = {"", "our company", "company", "self", "freelance", "self employed"}


def normalize_company_name(name: str | None) -> str:
    """Collapse a company name to a stable cache key. Returns "" if unusable."""
    if not name or not name.strip():
        return ""
    s = name.lower().strip()
    s = re.sub(r"[.,]", " ", s)            # punctuation that splits tokens
    s = re.sub(r"[^a-z0-9& ]", " ", s)     # drop everything else
    s = re.sub(r"\s+", " ", s).strip()
    tokens = s.split()
    while tokens and tokens[-1] in _LEGAL_SUFFIXES:
        tokens.pop()
    key = " ".join(tokens) if tokens else s
    return "" if key in _PLACEHOLDERS else key


def get_company_logos(db: Session, names) -> dict[str, str]:
    """
    Cache-only batch read. Returns {original_name: logo_url} for every name that
    has a resolved logo in the cache. Never touches the network.
    """
    keyed: dict[str, str] = {}          # name_key -> original name
    for n in names:
        k = normalize_company_name(n)
        if k:
            keyed.setdefault(k, n)
    if not keyed:
        return {}

    rows = (
        db.query(models.CompanyLogo)
        .filter(models.CompanyLogo.name_key.in_(list(keyed.keys())))
        .all()
    )
    out: dict[str, str] = {}
    for row in rows:
        if row.logo_url and row.name_key in keyed:
            out[keyed[row.name_key]] = row.logo_url
    return out


def pending_company_names(db: Session, names) -> list[str]:
    """Return the subset of `names` that have NO cache row yet (need resolving)."""
    keyed: dict[str, str] = {}
    for n in names:
        k = normalize_company_name(n)
        if k:
            keyed.setdefault(k, n)
    if not keyed:
        return []

    existing = {
        row.name_key
        for row in db.query(models.CompanyLogo.name_key)
        .filter(models.CompanyLogo.name_key.in_(list(keyed.keys())))
        .all()
    }
    return [orig for key, orig in keyed.items() if key not in existing]


def resolve_company_logos_task(names) -> None:
    """
    Background task: resolve a logo for each uncached company NAME and persist it
    (positive or negative) to the shared cache. Safe to call with names that are
    already cached — they're skipped. Network-tolerant; never raises.
    """
    from database import SessionLocal
    from services.company_logo import resolve_brand_by_name

    # De-dupe by cache key up front so we resolve each distinct company once.
    keyed: dict[str, str] = {}
    for n in names:
        k = normalize_company_name(n)
        if k:
            keyed.setdefault(k, n)
    if not keyed:
        return

    with SessionLocal() as session:
        for key, original in keyed.items():
            try:
                if session.query(models.CompanyLogo).filter_by(name_key=key).first():
                    continue  # already resolved (or another worker beat us)

                brand = resolve_brand_by_name(original, "company")
                logo = brand.get("logo_url")
                session.add(models.CompanyLogo(
                    name_key=key,
                    display_name=original.strip()[:255],
                    logo_url=logo,
                    website_url=brand.get("website_url"),
                    status="resolved" if logo else "failed",
                ))
                session.commit()
                logger.info("Cached company logo for %r: %s", original, logo)
            except Exception as exc:  # noqa: BLE001 — unique-race or network; keep going
                session.rollback()
                logger.warning("Logo cache failed for %r: %s", original, exc)
