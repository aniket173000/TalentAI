"""
TeamReportBuilder — deterministic (no-LLM) rollup of a period's per-engineer
PulseReports into the org-level TeamReport the dashboard reads directly.

Pure aggregation → cheap, reproducible, and precomputed once at period close so
the dashboard is an O(1) row read regardless of concurrent admins (HLD §4.2).
"""
from __future__ import annotations

import json
import logging
import statistics

from sqlalchemy.orm import Session

import models
from services.fluency.prompts import RUBRIC

logger = logging.getLogger(__name__)

_LABELS = {d["key"]: d["label"] for d in RUBRIC}


def _analyzed_reports(db: Session, org_id: int, period_id: int) -> list[models.PulseReport]:
    return (
        db.query(models.PulseReport)
        .filter(models.PulseReport.org_id == org_id,
                models.PulseReport.period_id == period_id)
        .all()
    )


def _dimension_averages(reports: list[models.PulseReport]) -> dict[str, float]:
    buckets: dict[str, list[float]] = {}
    for r in reports:
        try:
            dims = json.loads(r.dimensions or "[]")
        except (ValueError, TypeError):
            continue
        for d in dims:
            score = d.get("score")
            if isinstance(score, (int, float)):
                buckets.setdefault(d["key"], []).append(float(score))
    return {k: round(statistics.mean(v), 1) for k, v in buckets.items() if v}


def _gap_heatmap(dim_avgs: dict[str, float]) -> list[dict]:
    """Weakest dimensions first — where the team should focus enablement."""
    ordered = sorted(dim_avgs.items(), key=lambda kv: kv[1])
    return [
        {"key": k, "label": _LABELS.get(k, k), "avg": v, "rank": i + 1}
        for i, (k, v) in enumerate(ordered)
    ]


def _trend(db: Session, org_id: int, current_label: str, current_index: float | None) -> list[dict]:
    prior = (
        db.query(models.TeamReport, models.ReportingPeriod)
        .join(models.ReportingPeriod, models.TeamReport.period_id == models.ReportingPeriod.id)
        .filter(models.TeamReport.org_id == org_id)
        .order_by(models.ReportingPeriod.starts_at.asc())
        .all()
    )
    points = [
        {"period_label": p.label, "team_index": tr.team_index}
        for tr, p in prior if p.label != current_label
    ]
    points.append({"period_label": current_label, "team_index": current_index})
    return points


def build_team_report(db: Session, org: models.Organization,
                      period: models.ReportingPeriod) -> models.TeamReport:
    """Compute (or recompute) the TeamReport for one period. Idempotent:
    upserts the single (org, period) row."""
    reports = _analyzed_reports(db, org.id, period.id)
    overalls = [r.overall_score for r in reports if r.overall_score is not None]
    team_index = round(statistics.mean(overalls), 1) if overalls else None
    dim_avgs = _dimension_averages(reports)

    payload = {
        "seats_reporting": len(reports),
        "team_index": team_index,
        "dimension_averages": json.dumps(dim_avgs, ensure_ascii=False),
        "gap_heatmap": json.dumps(_gap_heatmap(dim_avgs), ensure_ascii=False),
        "trend": json.dumps(_trend(db, org.id, period.label, team_index), ensure_ascii=False),
    }

    existing = (
        db.query(models.TeamReport)
        .filter(models.TeamReport.org_id == org.id,
                models.TeamReport.period_id == period.id)
        .first()
    )
    if existing:
        for k, v in payload.items():
            setattr(existing, k, v)
        tr = existing
    else:
        tr = models.TeamReport(org_id=org.id, period_id=period.id, **payload)
        db.add(tr)
    db.commit()
    db.refresh(tr)
    logger.info("Pulse team report org=%s period=%s: index=%s seats=%d",
                org.id, period.label, team_index, len(reports))
    return tr
