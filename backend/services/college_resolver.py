"""
Canonicalise free-text college names so every spelling of the same institution
maps to ONE canonical name (and therefore one college page).

Resolution order (cheapest → most expensive):
  1. Alias cache  — exact normalised match we've resolved before (no AI cost).
  2. College table — exact name / short_name match against a known college.
  3. AI           — pick the canonical, commonly-known name. The AI is shown
                    nearby existing colleges so it reuses one instead of
                    inventing yet another variant.

Every resolution is written back to the alias cache, so each distinct spelling
costs at most one AI call ever.
"""
import logging
import re

from sqlalchemy import func
from sqlalchemy.orm import Session

import models

logger = logging.getLogger(__name__)


def _norm(name: str) -> str:
    """Normalised match key: lowercase, strip punctuation, collapse whitespace."""
    s = (name or "").lower()
    s = re.sub(r"[^\w\s]", " ", s)        # drop punctuation
    s = re.sub(r"\s+", " ", s).strip()    # collapse whitespace
    return s


def _clean(name: str) -> str:
    """Display-safe trim: collapse whitespace, keep original casing/punctuation."""
    return re.sub(r"\s+", " ", (name or "").strip())


def _significant_tokens(key: str) -> set[str]:
    """Tokens useful for finding nearby colleges (drop common filler words)."""
    stop = {
        "the", "of", "and", "for", "institute", "institution", "university",
        "college", "school", "technology", "science", "sciences", "indian",
        "national", "engineering", "studies",
    }
    return {t for t in key.split() if t not in stop and len(t) > 1}


def _save_alias(db: Session, key: str, canonical: str) -> None:
    if not key or not canonical:
        return
    if db.query(models.CollegeAlias).filter(
        models.CollegeAlias.alias_key == key
    ).first():
        return
    # Savepoint so a duplicate-key race only rolls back this insert, never the
    # caller's pending profile changes.
    try:
        with db.begin_nested():
            db.add(models.CollegeAlias(alias_key=key, canonical_name=canonical))
    except Exception as exc:  # never let caching break the write path
        logger.warning("Failed to cache college alias %r -> %r: %s", key, canonical, exc)


async def canonicalize_college_name(db: Session, raw_name: str) -> str:
    """
    Return the canonical college name for `raw_name`. Falls back to the cleaned
    input on any error so a save never fails because of canonicalisation.
    """
    clean = _clean(raw_name)
    if not clean:
        return clean
    key = _norm(clean)

    # 1. Alias cache.
    alias = db.query(models.CollegeAlias).filter(
        models.CollegeAlias.alias_key == key
    ).first()
    if alias:
        return alias.canonical_name

    # 2. Exact match against an existing College (name or short_name).
    existing = db.query(models.College).filter(
        func.lower(models.College.name) == clean.lower()
    ).first()
    if not existing:
        existing = db.query(models.College).filter(
            func.lower(models.College.short_name) == clean.lower()
        ).first()
    if existing:
        _save_alias(db, key, existing.name)
        return existing.name

    # 3. AI resolution, biased toward reusing a nearby existing college.
    candidates = _nearby_colleges(db, key)
    canonical = await _ai_canonicalize(clean, candidates)
    canonical = _clean(canonical) or clean

    # If the AI landed on (a variant of) an existing college, snap to its
    # stored name so casing/spacing stay identical across rows.
    match = db.query(models.College).filter(
        func.lower(models.College.name) == canonical.lower()
    ).first()
    if match:
        canonical = match.name

    _save_alias(db, key, canonical)
    return canonical


def _nearby_colleges(db: Session, key: str, limit: int = 20) -> list[str]:
    """Existing college names that share a significant token with the input."""
    tokens = _significant_tokens(key)
    if not tokens:
        return []
    q = db.query(models.College.name)
    conds = [models.College.name.ilike(f"%{t}%") for t in tokens]
    from sqlalchemy import or_
    rows = q.filter(or_(*conds)).limit(limit).all()
    return [r.name for r in rows]


async def _ai_canonicalize(name: str, candidates: list[str]) -> str:
    """Ask the configured LLM for the canonical commonly-known college name."""
    from config import settings

    import json

    existing_block = ""
    if candidates:
        listed = "\n".join(f"- {c}" for c in candidates)
        existing_block = (
            "\nColleges already in our system (REUSE one of these EXACTLY if the "
            f"input refers to the same institution):\n{listed}\n"
        )

    prompt = (
        f'A user entered "{name}" as their college/university.\n'
        "Return the single canonical, most commonly-known name for this institution "
        "(e.g. 'IIT Bombay' not 'Indian Institute of Technology Bombay'; "
        "'IIIT Nagpur' not 'Indian Institute of Information Technology Nagpur'; "
        "'NIT Trichy' not 'National Institute of Technology Tiruchirappalli').\n"
        f"{existing_block}"
        'Respond with JSON only: {"canonical": "<name>"}'
    )

    try:
        p = settings.AI_PROVIDER.lower()
        if p == "claude" and settings.ANTHROPIC_API_KEY:
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            resp = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=120,
                messages=[{"role": "user", "content": prompt}],
            )
            text = resp.content[0].text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            data = json.loads(text)
        else:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            resp = await client.chat.completions.create(
                model=settings.AI_MODEL_MINI,
                reasoning_effort="low",
                response_format={"type": "json_object"},
                messages=[{"role": "user", "content": prompt}],
            )
            data = json.loads(resp.choices[0].message.content)
        canonical = (data.get("canonical") or "").strip()
        return canonical or name
    except Exception as exc:
        logger.warning("AI college canonicalization failed for %r: %s", name, exc)
        return name
