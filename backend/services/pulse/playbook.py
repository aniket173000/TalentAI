"""
PlaybookExtractor — the peer-learning engine.

One extra LLM pass over the period's TOP-scoring engineers' report highlights.
It distills each into a short, transferable technique other engineers can copy
("verify generated code with a targeted test before accepting"). Anonymized by
default; a source engineer is credited only if they set playbook_attribution.

This is what turns the product from "a ranking dashboard" into "this made my
median engineer better" — the renewal driver in the finance doc.
"""
from __future__ import annotations

import json
import logging

from sqlalchemy.orm import Session

import models
from config import settings
from services.fluency.judge import FluencyJudgeError, get_fluency_judge

logger = logging.getLogger(__name__)

_SYSTEM = (
    "You extract transferable AI-collaboration techniques from strong engineers' "
    "coding sessions so their teammates can copy what works. Each technique must be "
    "concrete, actionable, and phrased generically (no project/company specifics). "
    "Respond with valid JSON only."
)


def _build_prompt(entries: list[dict]) -> str:
    return f"""Below are the strongest AI-collaboration moments from several engineers
this period (already scored). Turn them into a short team PLAYBOOK — reusable
techniques the rest of the team can adopt.

SOURCE MATERIAL (one block per engineer; `ref` identifies the source):
{json.dumps(entries, indent=1)[:40000]}

Return JSON with exactly this shape:
{{
  "entries": [
    {{
      "ref": "<the ref of the source engineer this came from>",
      "dimension_key": "<the rubric dimension this technique strengthens>",
      "technique": "<1-2 sentence reusable 'try this' technique, generic>",
      "evidence": "<a short illustrative quote, max 200 chars>"
    }}
  ]
}}
Produce at most {settings.PULSE_PLAYBOOK_TOP_K} entries — the most broadly useful,
distinct techniques. Skip anything that only makes sense for one specific codebase."""


def _top_reports(db: Session, org_id: int, period_id: int) -> list[models.PulseReport]:
    return (
        db.query(models.PulseReport)
        .filter(models.PulseReport.org_id == org_id,
                models.PulseReport.period_id == period_id,
                models.PulseReport.overall_score.isnot(None))
        .order_by(models.PulseReport.overall_score.desc())
        .limit(settings.PULSE_PLAYBOOK_TOP_K)
        .all()
    )


async def _extract(entries: list[dict]) -> list[dict]:
    judge = get_fluency_judge()
    # Reuse the judge's provider-abstracted JSON completion (retries/timeouts live there).
    result = await judge._complete_json(
        _SYSTEM, _build_prompt(entries),
        model=judge.aggregate_model, max_tokens=3_000,
    )
    out = result.get("entries")
    return out if isinstance(out, list) else []


def build_playbook(db: Session, org: models.Organization,
                   period: models.ReportingPeriod) -> list[models.PlaybookEntry]:
    """Mine the period's top sessions into PlaybookEntry rows (idempotent:
    replaces this period's entries). Anonymization respects each source seat's
    playbook_attribution consent flag."""
    import asyncio

    top = _top_reports(db, org.id, period.id)
    if not top:
        return []

    seat_by_id = {s.id: s for s in org.seats}
    material = []
    for r in top:
        try:
            hi = json.loads(r.highlights or "{}")
        except (ValueError, TypeError):
            hi = {}
        material.append({
            "ref": f"seat{r.seat_id}",
            "overall": r.overall_score,
            "best_moment": hi.get("best_moment"),
            "summary": (r.summary or "")[:800],
        })

    try:
        raw_entries = asyncio.run(_extract(material))
    except FluencyJudgeError as exc:
        logger.warning("Playbook extraction failed org=%s period=%s: %s", org.id, period.label, exc)
        return []

    # Replace this period's entries idempotently.
    db.query(models.PlaybookEntry).filter(
        models.PlaybookEntry.org_id == org.id,
        models.PlaybookEntry.period_id == period.id,
    ).delete(synchronize_session=False)

    created: list[models.PlaybookEntry] = []
    for e in raw_entries:
        ref = str(e.get("ref", ""))
        seat_id = int(ref[4:]) if ref.startswith("seat") and ref[4:].isdigit() else None
        seat = seat_by_id.get(seat_id) if seat_id else None
        attributed = bool(seat and seat.playbook_attribution)
        entry = models.PlaybookEntry(
            org_id=org.id,
            period_id=period.id,
            source_seat_id=seat_id,
            dimension_key=str(e.get("dimension_key") or "")[:50] or None,
            technique=str(e.get("technique") or "")[:1000],
            evidence=str(e.get("evidence") or "")[:300] or None,
            anonymized=not attributed,
            attributed_name=(seat.full_name or seat.email) if attributed else None,
        )
        if entry.technique:
            db.add(entry)
            created.append(entry)
    db.commit()
    logger.info("Pulse playbook org=%s period=%s: %d entries", org.id, period.label, len(created))
    return created
