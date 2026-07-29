"""
AI Fluency Team Report ("Pulse") API — the team product line.

Sold per-seat to companies. Reuses the fluency scoring engine in brief-free
"general work" mode (services/pulse/*). Three audiences, three auth models:

Org admin (JWT — the buyer):
    POST   /api/pulse/orgs                          create an organization
    GET    /api/pulse/orgs                          list my orgs
    GET    /api/pulse/orgs/{id}                      org detail
    PATCH  /api/pulse/orgs/{id}                      cadence / plan / seats
    POST   /api/pulse/orgs/{id}/seats               invite engineers (seat-limited)
    GET    /api/pulse/orgs/{id}/seats               list seats + adoption
    DELETE /api/pulse/orgs/{id}/seats/{sid}          offboard (revoke seat)
    GET    /api/pulse/orgs/{id}/dashboard            team AI fluency report
    GET    /api/pulse/orgs/{id}/playbook             peer-learning playbook
    POST   /api/pulse/orgs/{id}/close-period          close period → build rollup + playbook
    GET    /api/pulse/orgs/{id}/seats/{sid}/report    named report (consent-gated)

Engineer (seat token — no login needed, mirrors the assignment portal):
    GET    /api/pulse/portal/{token}                consent screen + setup
    POST   /api/pulse/portal/{token}/consent        opt in / set consent toggles
    POST   /api/pulse/portal/{token}/submit          upload this period's sessions
    GET    /api/pulse/me/report?token=              own report
    PATCH  /api/pulse/me/consent?token=             flip consent toggles

Public:
    GET    /api/pulse/plans?region=                 pricing catalog (IN | US)
"""
from __future__ import annotations

import asyncio
import json
import logging
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

import models
import schemas
from config import settings
from database import get_db
from routers.auth import get_current_user, get_optional_user
from services.admin_access import is_admin_email
from services.email_service import send_email
from services.fluency.scrubber import scrub_transcript_bytes
from services.fluency.transcript_parser import TranscriptParseError, parse_claude_code_jsonl
from services.pulse import aggregation, billing, periods, playbook, store
from services.pulse.pipeline import dispatch_pulse_analysis

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/pulse", tags=["pulse"])


# ── early-access gate ───────────────────────────────────────────────────────
# Pulse is pre-launch: org creation requires an approved access request.
# ADMIN_EMAILS are auto-granted so the owner can always test.

def has_pulse_access(db: Session, user: models.User) -> bool:
    if is_admin_email(user.email):
        return True
    row = (db.query(models.PulseAccessRequest)
           .filter(models.PulseAccessRequest.email == user.email.lower(),
                   models.PulseAccessRequest.status == "granted").first())
    return row is not None


def require_pulse_access(db: Session = Depends(get_db),
                         user: models.User = Depends(get_current_user)) -> models.User:
    if not has_pulse_access(db, user):
        raise HTTPException(
            status_code=403,
            detail="Pulse is in early access. Request access and we'll enable your account.")
    return user


# ── auth / ownership helpers ────────────────────────────────────────────────

def _own_org(db: Session, org_id: int, user: models.User) -> models.Organization:
    org = db.get(models.Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if org.admin_user_id != user.id:
        raise HTTPException(status_code=403, detail="You do not administer this organization")
    return org


def _seat_by_token(db: Session, token: str) -> models.OrgSeat:
    seat = db.query(models.OrgSeat).filter(models.OrgSeat.seat_token == token).first()
    if not seat or seat.status == "revoked" or seat.revoked_at is not None:
        raise HTTPException(status_code=404, detail="Invalid or revoked Pulse link")
    return seat


def _connect_command(token: str) -> str:
    return (f'claude mcp add --transport http nideknil-pulse '
            f'{settings.PULSE_MCP_PUBLIC_URL}/mcp-pulse/ '
            f'--header "Authorization: Bearer {token}"')


def _submit_command(token: str) -> str:
    return f"npx nideknil-submit {token} --pulse"


def _org_response(db: Session, org: models.Organization) -> schemas.OrgResponse:
    resp = schemas.OrgResponse.model_validate(org)
    resp.active_seats = billing.active_seat_count(db, org.id)
    return resp


# ── Org admin: organizations ────────────────────────────────────────────────

@router.post("/orgs", response_model=schemas.OrgResponse, status_code=201)
def create_org(body: schemas.OrgCreate, db: Session = Depends(get_db),
               user: models.User = Depends(require_pulse_access)):
    org = models.Organization(
        name=body.name.strip()[:255] or "My Team",
        admin_user_id=user.id,
        cadence=body.cadence,
        region=body.region,
        plan="trial",
        seats_limit=settings.PULSE_TRIAL_SEATS,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    logger.info("Pulse org created id=%s by user=%s region=%s", org.id, user.id, org.region)
    return _org_response(db, org)


@router.get("/orgs", response_model=list[schemas.OrgResponse])
def list_orgs(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    orgs = (db.query(models.Organization)
            .filter(models.Organization.admin_user_id == user.id)
            .order_by(models.Organization.created_at.desc()).all())
    return [_org_response(db, o) for o in orgs]


@router.get("/orgs/{org_id}", response_model=schemas.OrgResponse)
def get_org(org_id: int, db: Session = Depends(get_db),
            user: models.User = Depends(get_current_user)):
    return _org_response(db, _own_org(db, org_id, user))


@router.patch("/orgs/{org_id}", response_model=schemas.OrgResponse)
def update_org(org_id: int, body: schemas.OrgCreate, db: Session = Depends(get_db),
               user: models.User = Depends(get_current_user)):
    org = _own_org(db, org_id, user)
    org.name = body.name.strip()[:255] or org.name
    org.region = body.region
    # Weekly cadence requires a plan that allows it (billing guardrail).
    if body.cadence == "weekly" and not billing.plan_allows_weekly(org):
        raise HTTPException(status_code=402,
                            detail="Weekly cadence requires the Growth/Team plan or higher")
    org.cadence = body.cadence
    db.commit()
    db.refresh(org)
    return _org_response(db, org)


# ── Org admin: seats ────────────────────────────────────────────────────────

@router.post("/orgs/{org_id}/seats", response_model=list[schemas.SeatInviteResult])
async def invite_seats(org_id: int, body: schemas.SeatInviteRequest,
                       db: Session = Depends(get_db),
                       user: models.User = Depends(get_current_user)):
    org = _own_org(db, org_id, user)
    emails = [e.strip().lower() for e in body.emails if e.strip()]
    if not emails:
        raise HTTPException(status_code=400, detail="Provide at least one email")

    billing.enforce_seat_limit(db, org, adding=len(emails))

    results: list[schemas.SeatInviteResult] = []
    for email in emails:
        existing = (db.query(models.OrgSeat)
                    .filter(models.OrgSeat.org_id == org.id,
                            models.OrgSeat.email == email).first())
        if existing and existing.status != "revoked":
            continue  # already an active/invited seat — idempotent
        if existing:  # re-activate a revoked seat with a fresh token
            existing.status = "invited"
            existing.revoked_at = None
            existing.seat_token = secrets.token_urlsafe(32)
            seat = existing
        else:
            seat = models.OrgSeat(
                org_id=org.id, email=email, role=body.role,
                status="invited", seat_token=secrets.token_urlsafe(32),
            )
            db.add(seat)
        db.commit()
        db.refresh(seat)

        portal_url = f"{settings.FRONTEND_URL}/pulse/portal/{seat.seat_token}"
        try:
            await send_email(
                to_email=email,
                subject=f"You're invited to {org.name}'s AI Fluency Pulse",
                body=(f"{org.name} uses Nideknil Pulse to help the team get better at "
                      f"working with AI.\n\nOpen your private setup page (only you see your "
                      f"own report):\n  {portal_url}\n\nIt takes 1 minute and your "
                      f"participation is opt-in.\n"),
            )
        except Exception as exc:                       # email failure never drops the seat
            logger.warning("Pulse invite email to %s failed: %s", email, exc)

        results.append(schemas.SeatInviteResult(
            seat=schemas.SeatResponse.model_validate(seat),
            connect_command=_connect_command(seat.seat_token),
        ))
    return results


@router.get("/orgs/{org_id}/seats", response_model=list[schemas.SeatResponse])
def list_seats(org_id: int, db: Session = Depends(get_db),
               user: models.User = Depends(get_current_user)):
    org = _own_org(db, org_id, user)
    seats = (db.query(models.OrgSeat)
             .filter(models.OrgSeat.org_id == org.id,
                     models.OrgSeat.status != "revoked")
             .order_by(models.OrgSeat.invited_at.asc()).all())
    return [schemas.SeatResponse.model_validate(s) for s in seats]


@router.delete("/orgs/{org_id}/seats/{seat_id}", status_code=204)
def offboard_seat(org_id: int, seat_id: int, db: Session = Depends(get_db),
                  user: models.User = Depends(get_current_user)):
    org = _own_org(db, org_id, user)
    seat = db.get(models.OrgSeat, seat_id)
    if not seat or seat.org_id != org.id:
        raise HTTPException(status_code=404, detail="Seat not found")
    seat.status = "revoked"
    seat.revoked_at = datetime.now(timezone.utc)
    db.commit()   # keeps derived reports; only the token/access is revoked


# ── Org admin: dashboard, playbook, period close ─────────────────────────────

def _resolve_period(db: Session, org: models.Organization,
                    label: str | None) -> models.ReportingPeriod | None:
    if label:
        return (db.query(models.ReportingPeriod)
                .filter(models.ReportingPeriod.org_id == org.id,
                        models.ReportingPeriod.label == label).first())
    return periods.resolve_open_period(db, org)


@router.get("/orgs/{org_id}/dashboard", response_model=schemas.TeamDashboardResponse)
def team_dashboard(org_id: int, period: str | None = Query(None),
                   db: Session = Depends(get_db),
                   user: models.User = Depends(get_current_user)):
    org = _own_org(db, org_id, user)
    per = _resolve_period(db, org, period)
    if per is None:
        raise HTTPException(status_code=404, detail="No such period")

    # Recompute the rollup so an open period shows live aggregates; a closed
    # period returns its frozen precomputed row (recompute is idempotent).
    tr = aggregation.build_team_report(db, org, per)

    seats_active = billing.active_seat_count(db, org.id)

    # Leaderboard: only engineers who opted into attribution appear by name;
    # everyone else is folded into anonymous entries (recognition, not surveillance).
    rows = (db.query(models.PulseReport, models.OrgSeat)
            .join(models.OrgSeat, models.PulseReport.seat_id == models.OrgSeat.id)
            .filter(models.PulseReport.org_id == org.id,
                    models.PulseReport.period_id == per.id,
                    models.PulseReport.overall_score.isnot(None))
            .order_by(models.PulseReport.overall_score.desc()).all())
    leaderboard = [
        schemas.LeaderboardEntry(
            name=(seat.full_name or seat.email) if seat.playbook_attribution else "Anonymous engineer",
            overall_score=rep.overall_score,
            attributed=seat.playbook_attribution,
        )
        for rep, seat in rows
    ]

    return schemas.TeamDashboardResponse(
        org_id=org.id,
        period_label=per.label,
        team_index=tr.team_index,
        seats_reporting=tr.seats_reporting,
        seats_active=seats_active,
        adoption=round(tr.seats_reporting / seats_active, 3) if seats_active else 0.0,
        dimension_averages=json.loads(tr.dimension_averages or "{}"),
        gap_heatmap=json.loads(tr.gap_heatmap or "[]"),
        trend=json.loads(tr.trend or "[]"),
        leaderboard=leaderboard,
    )


@router.get("/orgs/{org_id}/playbook", response_model=list[schemas.PlaybookEntryResponse])
def get_playbook(org_id: int, period: str | None = Query(None),
                 db: Session = Depends(get_db),
                 user: models.User = Depends(get_current_user)):
    org = _own_org(db, org_id, user)
    per = _resolve_period(db, org, period)
    if per is None:
        return []
    entries = (db.query(models.PlaybookEntry)
               .filter(models.PlaybookEntry.org_id == org.id,
                       models.PlaybookEntry.period_id == per.id).all())
    return [
        schemas.PlaybookEntryResponse(
            id=e.id, period_label=per.label, dimension_key=e.dimension_key,
            technique=e.technique, evidence=e.evidence, attributed_name=e.attributed_name,
        ) for e in entries
    ]


@router.post("/orgs/{org_id}/close-period", response_model=schemas.TeamDashboardResponse)
def close_period(org_id: int, period: str | None = Query(None),
                 db: Session = Depends(get_db),
                 user: models.User = Depends(get_current_user)):
    """Freeze a period: build the rollup + mine the Playbook, then mark closed.
    In production this is also driven by a scheduled job at cadence end."""
    org = _own_org(db, org_id, user)
    per = _resolve_period(db, org, period)
    if per is None:
        raise HTTPException(status_code=404, detail="No such period")
    aggregation.build_team_report(db, org, per)
    playbook.build_playbook(db, org, per)
    periods.close_period(db, per)
    return team_dashboard(org_id, per.label, db, user)


@router.get("/orgs/{org_id}/seats/{seat_id}/report", response_model=schemas.PulseReportResponse)
def admin_seat_report(org_id: int, seat_id: int, period: str | None = Query(None),
                      db: Session = Depends(get_db),
                      user: models.User = Depends(get_current_user)):
    org = _own_org(db, org_id, user)
    seat = db.get(models.OrgSeat, seat_id)
    if not seat or seat.org_id != org.id:
        raise HTTPException(status_code=404, detail="Seat not found")
    if not seat.share_individual_report:
        raise HTTPException(
            status_code=403,
            detail="This engineer has not consented to sharing their individual report. "
                   "You can see team aggregates only.")
    per = _resolve_period(db, org, period)
    return _seat_report_response(db, seat, per)


# ── Engineer: portal, consent, submit, own report ────────────────────────────

def _seat_report_response(db: Session, seat: models.OrgSeat,
                          per: models.ReportingPeriod | None) -> schemas.PulseReportResponse:
    q = (db.query(models.PulseReport, models.ReportingPeriod)
         .join(models.ReportingPeriod, models.PulseReport.period_id == models.ReportingPeriod.id)
         .filter(models.PulseReport.seat_id == seat.id))
    if per is not None:
        q = q.filter(models.PulseReport.period_id == per.id)
    row = q.order_by(models.ReportingPeriod.starts_at.desc()).first()
    if not row:
        raise HTTPException(status_code=404, detail="No report yet for this period")
    rep, period = row

    def _loads(value, default):
        try:
            return json.loads(value) if value else default
        except (ValueError, TypeError):
            return default

    return schemas.PulseReportResponse(
        submission_id=rep.submission_id,
        period_label=period.label,
        overall_score=rep.overall_score,
        summary=rep.summary or "",
        dimensions=_loads(rep.dimensions, []),
        highlights=_loads(rep.highlights, {}),
        metrics=_loads(rep.metrics, {}),
        integrity_flags=_loads(rep.integrity_flags, []),
        integrity_confidence=rep.integrity_confidence,
        created_at=rep.created_at,
    )


@router.get("/portal/{token}", response_model=schemas.PulsePortalView)
def portal_view(token: str, db: Session = Depends(get_db)):
    seat = _seat_by_token(db, token)
    org = seat.organization
    per = periods.resolve_open_period(db, org)
    latest = (db.query(models.PulseSubmission)
              .filter(models.PulseSubmission.seat_id == seat.id)
              .order_by(models.PulseSubmission.submitted_at.desc()).first())
    return schemas.PulsePortalView(
        org_name=org.name,
        engineer_name=seat.full_name,
        cadence=org.cadence,
        status=seat.status,
        consented=seat.consented_at is not None,
        current_period_label=per.label,
        latest_status=latest.status if latest else None,
        connect_command=_connect_command(token),
        submit_command=_submit_command(token),
    )


@router.post("/portal/{token}/consent", response_model=schemas.PulsePortalView)
def portal_consent(token: str, body: schemas.ConsentUpdate,
                   full_name: str | None = Query(None),
                   db: Session = Depends(get_db)):
    seat = _seat_by_token(db, token)
    if seat.consented_at is None:
        seat.consented_at = datetime.now(timezone.utc)
        seat.status = "active"
    if full_name:
        seat.full_name = full_name.strip()[:255]
    if body.share_individual_report is not None:
        seat.share_individual_report = body.share_individual_report
    if body.playbook_attribution is not None:
        seat.playbook_attribution = body.playbook_attribution
    db.commit()
    return portal_view(token, db)


@router.patch("/me/consent", response_model=schemas.SeatResponse)
def update_consent(body: schemas.ConsentUpdate, token: str = Query(...),
                   db: Session = Depends(get_db)):
    seat = _seat_by_token(db, token)
    if body.share_individual_report is not None:
        seat.share_individual_report = body.share_individual_report
    if body.playbook_attribution is not None:
        seat.playbook_attribution = body.playbook_attribution
    db.commit()
    db.refresh(seat)
    return schemas.SeatResponse.model_validate(seat)


@router.get("/me/report", response_model=schemas.PulseReportResponse)
def my_report(token: str = Query(...), period: str | None = Query(None),
              db: Session = Depends(get_db)):
    seat = _seat_by_token(db, token)
    per = None
    if period:
        per = (db.query(models.ReportingPeriod)
               .filter(models.ReportingPeriod.org_id == seat.org_id,
                       models.ReportingPeriod.label == period).first())
    return _seat_report_response(db, seat, per)


@router.post("/portal/{token}/submit", response_model=schemas.PulsePortalView)
async def portal_submit(
    token: str,
    files: list[UploadFile] = File(...),
    consent: bool = Form(...),
    work_note: str | None = Form(None),
    git_metadata: str | None = Form(None),
    submit_source: str = Form("cli"),
    db: Session = Depends(get_db),
):
    seat = _seat_by_token(db, token)
    org = seat.organization

    if not consent:
        raise HTTPException(status_code=400, detail="Consent is required to submit sessions")
    if not files:
        raise HTTPException(status_code=400, detail="Upload at least one .jsonl transcript file")
    if len(files) > settings.FLUENCY_MAX_FILES:
        raise HTTPException(status_code=400,
                            detail=f"Too many files (max {settings.FLUENCY_MAX_FILES})")

    # Opt-in on first submit if the engineer skipped the consent screen.
    if seat.consented_at is None:
        seat.consented_at = datetime.now(timezone.utc)
        seat.status = "active"
    seat.last_seen_at = datetime.now(timezone.utc)
    db.commit()

    period = periods.resolve_open_period(db, org)

    # One submission per (seat, period): reuse the row, replacing its bundle so a
    # re-submit within the period supersedes the prior one.
    submission = (db.query(models.PulseSubmission)
                  .filter(models.PulseSubmission.seat_id == seat.id,
                          models.PulseSubmission.period_id == period.id).first())
    if submission and submission.status == "processing":
        raise HTTPException(status_code=409, detail="Your last submission is still being analyzed")
    if submission is None:
        submission = models.PulseSubmission(
            org_id=org.id, seat_id=seat.id, period_id=period.id, status="submitted")
        db.add(submission)
        db.commit()
        db.refresh(submission)

    max_file = settings.FLUENCY_MAX_FILE_MB * 1024 * 1024
    max_total = settings.FLUENCY_MAX_TOTAL_MB * 1024 * 1024
    total = 0
    loop = asyncio.get_event_loop()
    stored_keys: list[str] = []
    session_count = 0
    parse_errors: list[str] = []

    for f in files:
        raw = await f.read()
        if len(raw) > max_file:
            raise HTTPException(status_code=400,
                                detail=f"{f.filename}: exceeds {settings.FLUENCY_MAX_FILE_MB}MB")
        total += len(raw)
        if total > max_total:
            raise HTTPException(status_code=400,
                                detail=f"Total upload exceeds {settings.FLUENCY_MAX_TOTAL_MB}MB")

        scrubbed, _stats = await loop.run_in_executor(None, scrub_transcript_bytes, raw)
        try:
            parse_claude_code_jsonl(scrubbed, fallback_session_id=f.filename or "upload")
            session_count += 1
        except TranscriptParseError as exc:
            parse_errors.append(f"{f.filename}: {exc}")
            continue

        key = await loop.run_in_executor(
            None, store.store_transcript, scrubbed, org.id, submission.id,
            f.filename or "session.jsonl")
        stored_keys.append(key)

    if not stored_keys:
        raise HTTPException(
            status_code=400,
            detail="No valid Claude Code transcripts found. Submit the .jsonl session files "
                   f"from ~/.claude/projects/<your-project>/. ({'; '.join(parse_errors[:3])})")

    clean_git = None
    if git_metadata:
        try:
            parsed = json.loads(git_metadata)
            if isinstance(parsed, dict):
                clean_git = json.dumps(parsed)[:8000]
        except (ValueError, TypeError):
            clean_git = None

    submission.transcript_file_keys = json.dumps(stored_keys)
    submission.transcript_bytes = total
    submission.session_count = session_count
    submission.work_note = (work_note or "").strip()[:2000] or None
    submission.git_metadata = clean_git
    submission.submit_source = submit_source if submit_source in ("web", "cli", "mcp") else "cli"
    submission.status = "submitted"
    submission.error = None
    submission.submitted_at = datetime.now(timezone.utc)
    db.commit()

    dispatch_pulse_analysis(submission.id)
    logger.info("Pulse submission %s: seat=%s period=%s %d files, analysis dispatched",
                submission.id, seat.id, period.label, len(stored_keys))
    return portal_view(token, db)


# ── Early access ──────────────────────────────────────────────────────────────

@router.get("/access", response_model=schemas.PulseAccessStatus)
def access_status(db: Session = Depends(get_db),
                  user: models.User = Depends(get_current_user)):
    """Does the signed-in user have Pulse access, and did they already request it?"""
    granted = has_pulse_access(db, user)
    req = (db.query(models.PulseAccessRequest)
           .filter(models.PulseAccessRequest.email == user.email.lower()).first())
    return schemas.PulseAccessStatus(
        has_access=granted,
        status="granted" if granted else (req.status if req else "none"),
    )


@router.post("/early-access", response_model=schemas.PulseAccessStatus)
async def request_early_access(body: schemas.EarlyAccessRequest,
                               db: Session = Depends(get_db),
                               user: models.User | None = Depends(get_optional_user)):
    """Public waitlist. Idempotent per email; re-submitting updates the details."""
    email = body.email.strip().lower()
    row = (db.query(models.PulseAccessRequest)
           .filter(models.PulseAccessRequest.email == email).first())
    if not row:
        row = models.PulseAccessRequest(email=email)
        db.add(row)
    # never downgrade an already-granted row
    row.user_id = user.id if user else row.user_id
    row.company = (body.company or "").strip()[:255] or row.company
    row.team_size = (body.team_size or "").strip()[:50] or row.team_size
    row.note = (body.note or "").strip()[:2000] or row.note
    if row.status != "granted":
        row.status = "requested"
    db.commit()
    try:
        await send_email(
            to_email=email,
            subject="You're on the Nideknil Pulse early-access list",
            body="Thanks for your interest in Nideknil Pulse — the AI Fluency Team Report. "
                 "We'll email you as soon as your team is enabled.\n",
        )
    except Exception as exc:
        logger.warning("Pulse early-access email to %s failed: %s", email, exc)
    return schemas.PulseAccessStatus(has_access=row.status == "granted", status=row.status)


def _require_admin(user: models.User) -> None:
    if not is_admin_email(user.email):
        raise HTTPException(status_code=403, detail="Admins only")


@router.get("/admin/requests", response_model=list[schemas.PulseAccessRequestRow])
def list_access_requests(db: Session = Depends(get_db),
                         user: models.User = Depends(get_current_user)):
    """Admin-only: the early-access waitlist, newest first."""
    _require_admin(user)
    rows = (db.query(models.PulseAccessRequest)
            .order_by(models.PulseAccessRequest.created_at.desc()).all())
    return [
        schemas.PulseAccessRequestRow(
            id=r.id, email=r.email, company=r.company, team_size=r.team_size,
            note=r.note, status=r.status, created_at=r.created_at,
        ) for r in rows
    ]


def _set_access_status(db: Session, email: str, status: str) -> models.PulseAccessRequest:
    target = email.strip().lower()
    row = (db.query(models.PulseAccessRequest)
           .filter(models.PulseAccessRequest.email == target).first())
    if not row:
        row = models.PulseAccessRequest(email=target)
        db.add(row)
    row.status = status
    row.granted_at = datetime.now(timezone.utc) if status == "granted" else None
    db.commit()
    return row


@router.post("/admin/grant", response_model=schemas.PulseAccessStatus)
async def grant_access(email: str = Query(...), db: Session = Depends(get_db),
                       user: models.User = Depends(get_current_user)):
    """Admin-only: flip an email to granted (ADMIN_EMAILS gate) + notify them."""
    _require_admin(user)
    row = _set_access_status(db, email, "granted")
    portal_url = f"{settings.FRONTEND_URL}/pulse/dashboard"
    try:
        await send_email(
            to_email=row.email,
            subject="You're in — Nideknil Pulse early access is live for your team",
            body=("Good news — your team is now enabled on Nideknil Pulse, the AI Fluency Team "
                  "Report.\n\nGet started:\n"
                  f"  1. Sign in at {settings.FRONTEND_URL}\n"
                  f"  2. Open Pulse → create your team: {portal_url}\n"
                  "  3. Invite your engineers — they connect Claude Code and submit their sessions.\n\n"
                  "Only each engineer sees their own report; you see the team signal.\n"),
        )
    except Exception as exc:
        logger.warning("Pulse grant email to %s failed: %s", row.email, exc)
    return schemas.PulseAccessStatus(has_access=True, status="granted")


@router.post("/admin/deny", response_model=schemas.PulseAccessStatus)
def deny_access(email: str = Query(...), db: Session = Depends(get_db),
                user: models.User = Depends(get_current_user)):
    """Admin-only: mark a request denied."""
    _require_admin(user)
    _set_access_status(db, email, "denied")
    return schemas.PulseAccessStatus(has_access=False, status="denied")


# ── Public: pricing catalog ───────────────────────────────────────────────────

@router.get("/plans", response_model=list[schemas.PlanResponse])
def list_plans(region: str = Query("IN")):
    catalog = billing.region_catalog(region)
    return [
        schemas.PlanResponse(
            key=p.key, name=p.name, seats_limit=p.seats_limit, cadence=p.cadence,
            price_minor=p.price_minor, currency=p.currency, features=list(p.features),
        ) for p in catalog.values()
    ]
