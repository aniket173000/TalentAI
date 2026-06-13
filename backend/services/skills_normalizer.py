"""
Skills normalisation service.

Loads the canonical taxonomy once at startup (LRU-cached), then maps
raw skill strings to canonical names via a pre-built alias lookup table.
Unmapped skills are returned as-is so callers can log them to the
review queue without creating a dependency on the database here.

Lookup complexity: O(1) per skill after the first call.
"""

import json
import logging
import re
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

_TAXONOMY_PATH = Path(__file__).parent.parent / "data" / "skills_taxonomy.json"


@lru_cache(maxsize=1)
def _load_taxonomy() -> tuple[dict[str, str], str]:
    """
    Parse the taxonomy file and build a reverse alias → canonical map.
    Cached for the process lifetime; call _load_taxonomy.cache_clear()
    to force a reload (e.g. during testing).
    """
    with _TAXONOMY_PATH.open(encoding="utf-8") as fh:
        data = json.load(fh)

    version: str = data.get("version", "unknown")
    alias_to_canonical: dict[str, str] = {}

    for canonical, aliases in data["skills"].items():
        alias_to_canonical[canonical.lower()] = canonical
        for alias in aliases:
            key = alias.strip().lower()
            if key and key not in alias_to_canonical:
                alias_to_canonical[key] = canonical

    logger.info(
        "Skills taxonomy v%s loaded: %d canonical skills, %d alias entries",
        version,
        len(data["skills"]),
        len(alias_to_canonical),
    )
    return alias_to_canonical, version


def _normalise_key(raw: str) -> str:
    """Collapse extra whitespace and lowercase for lookup."""
    return re.sub(r"\s+", " ", raw.strip()).lower()


def get_taxonomy_version() -> str:
    """Return the currently loaded taxonomy version string."""
    _, version = _load_taxonomy()
    return version


def normalize_skills(
    raw_skills: list[str],
) -> tuple[list[str], list[str], str]:
    """
    Map raw skill strings to canonical taxonomy names.

    Args:
        raw_skills: Strings extracted directly from a resume.

    Returns:
        normalized:        Canonical names, deduped, first-occurrence order.
        unmapped:          Raw strings that had no taxonomy match (preserved as-is).
        taxonomy_version:  Version string for reproducibility tracking.
    """
    alias_map, version = _load_taxonomy()

    normalized: list[str] = []
    unmapped: list[str] = []
    seen: set[str] = set()

    for skill in raw_skills:
        if not skill or not skill.strip():
            continue
        canonical = alias_map.get(_normalise_key(skill))
        if canonical:
            if canonical not in seen:
                normalized.append(canonical)
                seen.add(canonical)
        else:
            unmapped.append(skill.strip())

    return normalized, unmapped, version
