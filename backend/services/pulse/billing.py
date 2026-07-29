"""
Pulse billing scaffold — per-seat plan catalog for India and the US, and the
seat-limit guard used at invite time.

Prices live here (single source of truth, cross-checked against
docs/FINANCE_ai-fluency-team-report.md). Strategy-by-region: the same plan key
resolves to a different price/currency depending on Organization.region, so the
dual-market pricing from the finance doc is enforceable, not just documented.
Actual payment capture (Razorpay/Stripe) is intentionally out of v1 scope — this
module gates seats and exposes the catalog the frontend/checkout will use.
"""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy.orm import Session

import models


@dataclass(frozen=True)
class Plan:
    key: str
    name: str
    seats_limit: int          # 0 == unlimited (enterprise / custom)
    cadence: str              # "monthly" | "weekly" — the richest cadence allowed
    price_minor: int          # price per seat/month in minor units (paise / cents)
    currency: str             # "INR" | "USD"
    features: tuple[str, ...]


# region → plan_key → Plan.  Deliberately two separate ladders (not a currency
# convert): India competes on affordable monthly anchors, US on outcome/premium.
_CATALOG: dict[str, dict[str, Plan]] = {
    "IN": {
        "trial":     Plan("trial", "Free Trial", 5, "monthly", 0, "INR",
                          ("individual_report", "team_report")),
        "starter":   Plan("starter", "Starter", 10, "monthly", 29900, "INR",
                          ("individual_report", "team_report", "trend")),
        "growth":    Plan("growth", "Growth", 50, "weekly", 59900, "INR",
                          ("individual_report", "team_report", "trend", "playbook",
                           "gap_heatmap", "manager_digest", "leaderboard")),
        "enterprise": Plan("enterprise", "Enterprise", 0, "weekly", 99900, "INR",
                          ("all", "sso", "custom_rubric", "data_residency", "redaction")),
    },
    "US": {
        "trial":     Plan("trial", "Free Trial", 5, "weekly", 0, "USD",
                          ("individual_report", "team_report")),
        "team":      Plan("team", "Team", 25, "weekly", 1500, "USD",
                          ("individual_report", "team_report", "trend", "playbook")),
        "business":  Plan("business", "Business", 100, "weekly", 2900, "USD",
                          ("individual_report", "team_report", "trend", "playbook",
                           "gap_heatmap", "manager_digest", "leaderboard", "benchmarking", "sso")),
        "enterprise": Plan("enterprise", "Enterprise", 0, "weekly", 4000, "USD",
                          ("all", "sso", "custom_rubric", "data_residency", "redaction")),
    },
}


def region_catalog(region: str) -> dict[str, Plan]:
    return _CATALOG.get(region.upper(), _CATALOG["IN"])


def get_plan(region: str, plan_key: str) -> Plan | None:
    return region_catalog(region).get(plan_key)


def active_seat_count(db: Session, org_id: int) -> int:
    return (
        db.query(models.OrgSeat)
        .filter(models.OrgSeat.org_id == org_id,
                models.OrgSeat.status != "revoked")
        .count()
    )


def enforce_seat_limit(db: Session, org: models.Organization, adding: int = 1) -> None:
    """Raise 402 if inviting `adding` more seats would exceed the org's limit.
    seats_limit <= 0 means unlimited (enterprise)."""
    if org.seats_limit and org.seats_limit > 0:
        current = active_seat_count(db, org.id)
        if current + adding > org.seats_limit:
            raise HTTPException(
                status_code=402,
                detail=(f"Seat limit reached for the {org.plan} plan "
                        f"({current}/{org.seats_limit}). Upgrade to add more engineers."),
            )


def plan_allows_weekly(org: models.Organization) -> bool:
    plan = get_plan(org.region, org.plan)
    return bool(plan and plan.cadence == "weekly")
