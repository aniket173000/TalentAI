"""
Reporting-period resolution for Pulse.

A period is a cadence window (weekly | monthly) an org's submissions attach to.
`resolve_open_period` is idempotent: it returns the current open period for the
org, creating it on first use. Team rollup + Playbook are built when a period is
closed (see aggregation.py / playbook.py).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

import models

logger = logging.getLogger(__name__)


def _month_bounds(now: datetime) -> tuple[str, datetime, datetime]:
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # first day of next month
    if start.month == 12:
        nxt = start.replace(year=start.year + 1, month=1)
    else:
        nxt = start.replace(month=start.month + 1)
    return f"{now:%Y-%m}", start, nxt


def _week_bounds(now: datetime) -> tuple[str, datetime, datetime]:
    iso_year, iso_week, iso_weekday = now.isocalendar()
    monday = (now - timedelta(days=iso_weekday - 1)).replace(
        hour=0, minute=0, second=0, microsecond=0)
    return f"{iso_year}-W{iso_week:02d}", monday, monday + timedelta(days=7)


def compute_window(cadence: str, now: datetime | None = None) -> tuple[str, datetime, datetime]:
    now = now or datetime.now(timezone.utc)
    return _week_bounds(now) if cadence == "weekly" else _month_bounds(now)


def resolve_open_period(db: Session, org: models.Organization,
                        now: datetime | None = None) -> models.ReportingPeriod:
    """Get-or-create the org's current open period. Concurrency-safe enough for
    v1: a rare duplicate-insert race is caught by the (org_id, label) unique
    constraint and re-fetched."""
    label, starts_at, ends_at = compute_window(org.cadence, now)
    existing = (
        db.query(models.ReportingPeriod)
        .filter(models.ReportingPeriod.org_id == org.id,
                models.ReportingPeriod.label == label)
        .first()
    )
    if existing:
        return existing

    period = models.ReportingPeriod(
        org_id=org.id, label=label, cadence=org.cadence,
        starts_at=starts_at, ends_at=ends_at, status="open",
    )
    db.add(period)
    try:
        db.commit()
        db.refresh(period)
    except Exception:                    # unique-constraint race → someone else won
        db.rollback()
        period = (
            db.query(models.ReportingPeriod)
            .filter(models.ReportingPeriod.org_id == org.id,
                    models.ReportingPeriod.label == label)
            .first()
        )
    return period


def close_period(db: Session, period: models.ReportingPeriod) -> None:
    period.status = "closed"
    db.commit()
