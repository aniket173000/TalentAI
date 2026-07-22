"""
Candidate Cold Email — paste a hiring post, get a personalized application email
grounded in the candidate's own profile, review it, and send it FROM the
candidate's own Gmail (OAuth gmail.send). The recruiter sees the candidate's
address; Nideknil never appears in the mail.

  POST   /api/cold-email/analyze            {source_text, tone}   → extraction + evidence + draft (creates a draft row)
  POST   /api/cold-email/redraft            {id, tone}            → new draft from the stored analysis
  POST   /api/cold-email/send               {id, recruiter_email, subject, body, attach_resume}
  GET    /api/cold-email/status                                   → gmail connection + quota + resume availability
  GET    /api/cold-email/history
  GET    /api/cold-email/gmail/connect-url                        → Google consent URL (signed state)
  GET    /api/cold-email/gmail/callback                           → OAuth redirect target (no auth header — state carries identity)
  DELETE /api/cold-email/gmail                                    → revoke + forget the stored grant

Drafting and sending are separate, explicit calls — nothing goes out without the
candidate clicking Send. Quotas: hard daily cap for everyone (protects the
candidate's own Gmail reputation), monthly cap on the free plan (monetization).
"""
import json
import logging
from datetime import datetime, timedelta
from types import SimpleNamespace
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from config import settings
from database import get_db
from routers.auth import require_candidate
from routers.resume_profile import extract_and_store
from services import gmail_sender, storage_service
from services.cold_email_agent import (
    TEMPLATE_LABELS,
    ColdEmailError,
    analyze as run_analyze,
    draft_cold_email,
    grounding_warnings,
    recipient_warnings,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/cold-email", tags=["cold-email"])

_GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
_STATE_PURPOSE = "gmail_connect"


# ── Schemas ────────────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    source_text: str
    tone: str = "direct"


class RedraftRequest(BaseModel):
    id: int
    tone: str = "direct"


class SendRequest(BaseModel):
    id: int
    recruiter_email: str
    subject: str
    body: str
    attach_resume: bool = True


# ── Helpers ────────────────────────────────────────────────────────────────────

def _latest_profile(db: Session, user_id: int) -> models.CandidateProfile | None:
    return (
        db.query(models.CandidateProfile)
        .filter(models.CandidateProfile.user_id == user_id)
        .order_by(models.CandidateProfile.extracted_at.desc())
        .first()
    )


def _resume_text(db: Session, user_id: int, extension: models.CandidateExtension | None) -> str:
    """The candidate's resume text: fast-access copy on the extension, else the
    primary row in the resume vault."""
    if extension and extension.resume_text and len(extension.resume_text.strip()) > 50:
        return extension.resume_text
    row = (
        db.query(models.UserResume)
        .filter(models.UserResume.user_id == user_id)
        .order_by(models.UserResume.is_primary.desc(), models.UserResume.uploaded_at.desc())
        .first()
    )
    return row.resume_text if row and row.resume_text and len(row.resume_text.strip()) > 50 else ""


async def _ensure_profile(
    db: Session, user: models.User, extension: models.CandidateExtension | None
) -> models.CandidateProfile:
    """Latest extracted profile, running extraction on the fly for users whose
    resume predates structured extraction (self-healing — most existing accounts
    have resume text but no CandidateProfile row)."""
    profile = _latest_profile(db, user.id)
    if profile:
        return profile
    resume_text = _resume_text(db, user.id, extension)
    if not resume_text:
        raise HTTPException(
            status_code=409,
            detail="Upload a resume first — your profile is what makes the email personal.",
        )
    try:
        return await extract_and_store(db, user.id, resume_text)
    except Exception as exc:  # noqa: BLE001
        logger.error("Cold email: on-the-fly extraction failed for user %s: %s", user.id, exc)
        raise HTTPException(
            status_code=502,
            detail="We couldn't process your resume automatically — re-upload it from "
                   "your profile, then try again.",
        )


def _credential(db: Session, user_id: int) -> models.GoogleMailCredential | None:
    cred = (
        db.query(models.GoogleMailCredential)
        .filter(models.GoogleMailCredential.user_id == user_id)
        .first()
    )
    return cred if cred and not cred.revoked_at else None


def _primary_resume(db: Session, user_id: int) -> models.UserResume | None:
    """The resume to attach: primary first, else the newest one with a stored file."""
    return (
        db.query(models.UserResume)
        .filter(models.UserResume.user_id == user_id, models.UserResume.file_key.isnot(None))
        .order_by(models.UserResume.is_primary.desc(), models.UserResume.uploaded_at.desc())
        .first()
    )


def _quota(db: Session, user: models.User) -> dict:
    now = datetime.utcnow()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    sent_q = db.query(models.ColdEmail).filter(
        models.ColdEmail.user_id == user.id,
        models.ColdEmail.status == "sent",
    )
    sent_today = sent_q.filter(models.ColdEmail.sent_at >= day_start).count()
    sent_month = sent_q.filter(models.ColdEmail.sent_at >= month_start).count()

    is_free = (user.plan or "free") == "free"
    monthly_limit = settings.COLD_EMAIL_FREE_MONTHLY if is_free else None
    return {
        "daily_limit": settings.COLD_EMAIL_DAILY_CAP,
        "daily_remaining": max(0, settings.COLD_EMAIL_DAILY_CAP - sent_today),
        "monthly_limit": monthly_limit,  # null → unlimited (paid plan)
        "monthly_remaining": max(0, monthly_limit - sent_month) if monthly_limit is not None else None,
        "plan": user.plan or "free",
    }


def _duplicate_warning(db: Session, user_id: int, recruiter_email: str | None) -> list[str]:
    if not recruiter_email:
        return []
    prior = (
        db.query(models.ColdEmail)
        .filter(
            models.ColdEmail.user_id == user_id,
            models.ColdEmail.recruiter_email == recruiter_email,
            models.ColdEmail.status == "sent",
        )
        .order_by(models.ColdEmail.sent_at.desc())
        .first()
    )
    if prior and prior.sent_at:
        return [f"You already emailed {recruiter_email} on {prior.sent_at.strftime('%d %b %Y')}."]
    return []


def _row_response(row: models.ColdEmail, warnings: list[str], quota: dict, gmail: dict) -> dict:
    extraction = json.loads(row.extracted_json or "{}")
    evidence = json.loads(row.evidence_json or "{}")
    return {
        "id": row.id,
        "recruiter_email": row.recruiter_email,
        "recruiter_name": row.recruiter_name,
        "company": row.company,
        "role_title": row.role_title,
        "application_instructions": extraction.get("application_instructions"),
        "matched_skills": evidence.get("matched_skills", []),
        "subject": row.subject,
        "body": row.body,
        "tone": row.tone,
        "template": row.template,
        "template_label": TEMPLATE_LABELS.get(row.template, "Specific Opening"),
        "status": row.status,
        "warnings": warnings,
        "quota": quota,
        "gmail": gmail,
    }


def _gmail_state(db: Session, user: models.User) -> dict:
    cred = _credential(db, user.id)
    return {"connected": cred is not None, "address": cred.gmail_address if cred else None}


# ── Analyze / redraft ──────────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze(
    body: AnalyzeRequest,
    user: models.User = Depends(require_candidate),
    db: Session = Depends(get_db),
):
    extension = (
        db.query(models.CandidateExtension)
        .filter(models.CandidateExtension.user_id == user.id)
        .first()
    )
    profile = await _ensure_profile(db, user, extension)
    cred = _credential(db, user.id)
    # The signature shows the address the mail will actually come from.
    sender = SimpleNamespace(
        email=cred.gmail_address if cred else user.email,
        full_name=user.full_name,
        phone=user.phone,
    )

    try:
        result = await run_analyze(body.source_text, profile, sender, extension, body.tone)
    except ColdEmailError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.error("Cold email analyze failed for user %s: %s", user.id, exc)
        raise HTTPException(status_code=502, detail="Analysis failed — try again in a moment.")

    extraction = result["extraction"]
    row = models.ColdEmail(
        user_id=user.id,
        recruiter_email=extraction.get("recruiter_email"),
        recruiter_name=extraction.get("recruiter_name"),
        company=extraction.get("company"),
        role_title=extraction.get("role_title"),
        source_text=body.source_text.strip()[:8000],
        extracted_json=json.dumps(extraction, ensure_ascii=False),
        evidence_json=json.dumps(result["evidence"], ensure_ascii=False),
        subject=result["subject"],
        body=result["body"],
        tone=result["tone"],
        template=result["template"],
        status="draft",
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    warnings = result["warnings"] + _duplicate_warning(db, user.id, extraction.get("recruiter_email"))
    return _row_response(row, warnings, _quota(db, user), _gmail_state(db, user))


@router.post("/redraft")
async def redraft(
    body: RedraftRequest,
    user: models.User = Depends(require_candidate),
    db: Session = Depends(get_db),
):
    row = db.query(models.ColdEmail).filter(
        models.ColdEmail.id == body.id, models.ColdEmail.user_id == user.id
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Draft not found.")

    extraction = json.loads(row.extracted_json or "{}")
    evidence = json.loads(row.evidence_json or "{}")
    cred = _credential(db, user.id)
    sender_email = cred.gmail_address if cred else user.email

    try:
        draft = await draft_cold_email(extraction, evidence, sender_email, body.tone)
    except ColdEmailError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.error("Cold email redraft failed for user %s: %s", user.id, exc)
        raise HTTPException(status_code=502, detail="Redraft failed — try again in a moment.")

    row.subject, row.body, row.tone = draft["subject"], draft["body"], body.tone
    row.template = draft["template"]
    db.commit()

    warnings = recipient_warnings(row.recruiter_email)
    warnings += grounding_warnings(row.body, extraction, evidence)
    return _row_response(row, warnings, _quota(db, user), _gmail_state(db, user))


# ── Send ───────────────────────────────────────────────────────────────────────

@router.post("/send")
async def send(
    body: SendRequest,
    user: models.User = Depends(require_candidate),
    db: Session = Depends(get_db),
):
    row = db.query(models.ColdEmail).filter(
        models.ColdEmail.id == body.id, models.ColdEmail.user_id == user.id
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Draft not found.")
    if row.status == "sent":
        raise HTTPException(status_code=409, detail="This email was already sent.")

    target = (body.recruiter_email or "").strip()
    if "@" not in target:
        raise HTTPException(status_code=422, detail="A valid recruiter email is required.")
    if not body.subject.strip() or not body.body.strip():
        raise HTTPException(status_code=422, detail="Subject and body cannot be empty.")

    quota = _quota(db, user)
    if quota["daily_remaining"] <= 0:
        raise HTTPException(
            status_code=429,
            detail=f"Daily limit of {quota['daily_limit']} cold emails reached — this protects "
                   "your Gmail's sending reputation. Try again tomorrow.",
        )
    if quota["monthly_remaining"] is not None and quota["monthly_remaining"] <= 0:
        raise HTTPException(
            status_code=402,
            detail=f"You've used all {quota['monthly_limit']} free cold emails this month. "
                   "Upgrade to keep sending.",
        )

    cred = _credential(db, user.id)
    if not cred:
        raise HTTPException(status_code=409, detail="gmail_not_connected")

    attachment = None
    if body.attach_resume:
        resume = _primary_resume(db, user.id)
        if resume:
            content = storage_service.download_file(resume.file_key)
            if content:
                attachment = (resume.filename, content)
        if attachment is None:
            # Soft-fail: send without the file rather than block the application.
            logger.warning("Cold email %s: resume attachment unavailable, sending without.", row.id)

    # Persist any edits the candidate made in the editor before sending.
    row.recruiter_email = target
    row.subject = body.subject.strip()
    row.body = body.body
    db.flush()

    try:
        message_id = await gmail_sender.send_as_user(
            cred.refresh_token_encrypted,
            to_email=target,
            subject=row.subject,
            body_text=row.body,
            attachment=attachment,
        )
    except gmail_sender.GmailAuthError as exc:
        cred.revoked_at = datetime.utcnow()
        row.status, row.error = "failed", str(exc)[:1000]
        db.commit()
        raise HTTPException(status_code=409, detail="gmail_not_connected")
    except gmail_sender.GmailError as exc:
        row.status, row.error = "failed", str(exc)[:1000]
        db.commit()
        logger.error("Cold email send to %s failed: %s", target, exc)
        raise HTTPException(status_code=502, detail=f"Send failed: {exc}")

    row.status = "sent"
    row.sent_at = datetime.utcnow()
    row.gmail_message_id = message_id
    row.error = None
    db.commit()

    return {
        "status": "sent",
        "id": row.id,
        "sent_at": row.sent_at.isoformat(),
        "attached_resume": attachment is not None,
        "quota": _quota(db, user),
    }


# ── Status / history ───────────────────────────────────────────────────────────

@router.get("/status")
def status(
    user: models.User = Depends(require_candidate),
    db: Session = Depends(get_db),
):
    extension = (
        db.query(models.CandidateExtension)
        .filter(models.CandidateExtension.user_id == user.id)
        .first()
    )
    return {
        "gmail": _gmail_state(db, user),
        "quota": _quota(db, user),
        "has_resume_file": _primary_resume(db, user.id) is not None,
        # True when a profile exists OR analyze can build one on the fly from resume text
        "has_profile": _latest_profile(db, user.id) is not None
        or bool(_resume_text(db, user.id, extension)),
    }


@router.get("/history")
def history(
    user: models.User = Depends(require_candidate),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(models.ColdEmail)
        .filter(models.ColdEmail.user_id == user.id)
        # id tiebreaker: created_at has second precision, so rapid drafts tie
        .order_by(models.ColdEmail.created_at.desc(), models.ColdEmail.id.desc())
        .limit(50)
        .all()
    )
    return {
        "items": [
            {
                "id": r.id,
                "recruiter_email": r.recruiter_email,
                "company": r.company,
                "role_title": r.role_title,
                "subject": r.subject,
                "status": r.status,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "sent_at": r.sent_at.isoformat() if r.sent_at else None,
            }
            for r in rows
        ]
    }


# ── Gmail connect / disconnect ─────────────────────────────────────────────────

@router.get("/gmail/connect-url")
def gmail_connect_url(user: models.User = Depends(require_candidate)):
    """Authed XHR returns the Google consent URL; the browser then navigates to it.
    Identity rides in a short-lived signed `state` because Google's redirect back
    to /gmail/callback carries no Authorization header."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured on this server.")

    state = jwt.encode(
        {"sub": str(user.id), "purpose": _STATE_PURPOSE,
         "exp": datetime.utcnow() + timedelta(minutes=10)},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    params = {
        "response_type": "code",
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GMAIL_REDIRECT_URI,
        "scope": gmail_sender.GMAIL_SCOPES,
        "state": state,
        # offline + consent guarantees a refresh token is (re)issued every connect.
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    return {"url": f"{_GOOGLE_AUTHORIZE_URL}?{urlencode(params)}"}


@router.get("/gmail/callback")
async def gmail_callback(
    code: str = Query(default=None),
    state: str = Query(default=None),
    error: str = Query(default=None),
    db: Session = Depends(get_db),
):
    def _fe(result: str) -> RedirectResponse:
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/cold-email?gmail={result}")

    if error:
        logger.warning("Gmail connect OAuth error: %s", error)
        return _fe("error")
    if not code or not state:
        return _fe("error")

    try:
        payload = jwt.decode(state, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("purpose") != _STATE_PURPOSE:
            raise JWTError("wrong purpose")
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return _fe("error")

    async with httpx.AsyncClient(timeout=15) as client:
        token_resp = await client.post(
            gmail_sender.TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.GMAIL_REDIRECT_URI,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if token_resp.status_code != 200:
        logger.error("Gmail connect token exchange failed: %s", token_resp.text[:300])
        return _fe("error")

    tokens = token_resp.json()
    refresh_token = tokens.get("refresh_token")
    granted_scopes = tokens.get("scope", "")
    if "gmail.send" not in granted_scopes:
        # User unticked the send permission on the consent screen.
        return _fe("scope_denied")
    if not refresh_token:
        logger.error("Gmail connect: no refresh_token in response (prompt=consent should prevent this).")
        return _fe("error")

    # Which Gmail account did they connect? That's the From: recruiters will see.
    async with httpx.AsyncClient(timeout=10) as client:
        ui_resp = await client.get(
            _GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {tokens.get('access_token', '')}"},
        )
    gmail_address = ui_resp.json().get("email", "") if ui_resp.status_code == 200 else ""
    if not gmail_address:
        return _fe("error")

    cred = (
        db.query(models.GoogleMailCredential)
        .filter(models.GoogleMailCredential.user_id == user_id)
        .first()
    )
    encrypted = gmail_sender.encrypt_token(refresh_token)
    if cred:
        cred.gmail_address = gmail_address
        cred.refresh_token_encrypted = encrypted
        cred.scopes = granted_scopes[:500]
        cred.connected_at = datetime.utcnow()
        cred.revoked_at = None
    else:
        db.add(models.GoogleMailCredential(
            user_id=user_id,
            gmail_address=gmail_address,
            refresh_token_encrypted=encrypted,
            scopes=granted_scopes[:500],
        ))
    db.commit()
    return _fe("connected")


@router.delete("/gmail")
async def gmail_disconnect(
    user: models.User = Depends(require_candidate),
    db: Session = Depends(get_db),
):
    cred = (
        db.query(models.GoogleMailCredential)
        .filter(models.GoogleMailCredential.user_id == user.id)
        .first()
    )
    if cred:
        await gmail_sender.revoke_grant(cred.refresh_token_encrypted)
        db.delete(cred)
        db.commit()
    return {"status": "disconnected"}
