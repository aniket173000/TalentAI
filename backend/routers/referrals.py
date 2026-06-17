"""
Referral feature router.

Endpoints
─────────
Verification
  POST /api/referrals/verify/send-otp      — send OTP to work email
  POST /api/referrals/verify/confirm-otp   — verify OTP + AI domain check

Referral Post (employee / referrer)
  POST   /api/referrals/posts              — create draft referral post
  GET    /api/referrals/posts/my           — my referral posts
  GET    /api/referrals/posts/{post_id}    — get single post (public)
  PATCH  /api/referrals/posts/{post_id}    — update draft post
  POST   /api/referrals/posts/{post_id}/open          — open for referral
  POST   /api/referrals/posts/{post_id}/close         — manually close
  POST   /api/referrals/posts/{post_id}/referring     — mark as referring
  POST   /api/referrals/posts/{post_id}/referred-all  — mark referred_all (terminal)
  DELETE /api/referrals/posts/{post_id}/candidates/{app_id} — remove candidate

Application (candidate)
  POST /api/referrals/posts/{post_id}/apply  — apply to referral post
  GET  /api/referrals/my-applications        — candidate's referral applications

Pool / Dashboard (referrer)
  GET  /api/referrals/posts/{post_id}/pool   — pool + waitlist for referrer

Discovery (public)
  GET /api/referrals/companies               — list companies with open referral posts
  GET /api/referrals/company/{company_name}  — referral posts grouped by job for a company
"""

import hashlib
import json
import logging
import re
import secrets
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from config import settings
from database import SessionLocal, get_db
from routers.auth import get_current_user
from services.ai_service import screen_resume
from services.email_service import (
    send_referral_auto_closed_email,
    send_referral_displacement_email,
    send_referral_otp_email,
    send_referral_pool_accepted_email,
    send_referral_pool_closed_not_referred_email,
    send_referral_pool_nearing_full_email,
    send_referral_pool_rejection_email,
    send_referral_rank_change_email,
    send_referral_referred_email,
    send_referral_waitlist_accepted_email,
)
from services.jd_parser import parse_job_requirements as _parse_jd

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/referrals", tags=["referrals"])

MAX_CLOSE_DAYS = 5
OTP_EXPIRY_MINUTES = 15


# ── Slug helpers ──────────────────────────────────────────────────────────────

def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    return re.sub(r"-+", "-", text).strip("-")


def _unique_slug(db: Session, base: str) -> str:
    slug, n = base, 2
    while db.query(models.ReferralPost).filter(models.ReferralPost.slug == slug).first():
        slug, n = f"{base}-{n}", n + 1
    return slug


# ── Auto-close check ──────────────────────────────────────────────────────────

async def _maybe_auto_close(post: models.ReferralPost, db: Session, bg: BackgroundTasks | None = None) -> None:
    """Auto-close the post if it has exceeded its closes_at window."""
    if post.status != "open":
        return
    if post.closes_at and datetime.utcnow() >= post.closes_at:
        post.status = "closed"
        db.commit()
        if bg and post.referrer:
            pool_count = db.query(models.ReferralApplication).filter(
                models.ReferralApplication.referral_post_id == post.id,
                models.ReferralApplication.status == "in_pool",
            ).count()
            bg.add_task(
                send_referral_auto_closed_email,
                post.referrer.email,
                post.referrer.full_name,
                post.title,
                post.company_name,
                post.slug or str(post.id),
                settings.FRONTEND_URL,
                pool_count,
            )


# ── AI domain verification ────────────────────────────────────────────────────

_FREE_DOMAINS = {
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
    "icloud.com", "protonmail.com", "ymail.com", "live.com",
    "rediffmail.com", "aol.com",
}


async def _clearbit_lookup(company_name: str) -> list[str]:
    """
    Call Clearbit's free autocomplete API to get known domains for a company.
    Returns a list of domains ordered by name relevance (most relevant first).
    No API key required.
    """
    import httpx

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://autocomplete.clearbit.com/v1/companies/suggest",
                params={"query": company_name},
                headers={"Accept": "application/json"},
            )
        if resp.status_code != 200:
            return []

        results = resp.json()  # list of {name, domain, logo}
        if not results:
            return []

        name_q = re.sub(r"[^a-z0-9]", "", company_name.lower())

        def _score(r: dict) -> float:
            """Score a Clearbit result by how closely the name matches the query."""
            r_name = re.sub(r"[^a-z0-9]", "", r.get("name", "").lower())
            if not r_name:
                return 0.0
            # Exact match
            if r_name == name_q:
                return 1.0
            # One is a prefix of the other
            if r_name.startswith(name_q) or name_q.startswith(r_name):
                return 0.9
            # Substring
            if name_q in r_name or r_name in name_q:
                return 0.7
            # Common leading chars ratio
            common = sum(a == b for a, b in zip(name_q, r_name))
            return common / max(len(name_q), len(r_name))

        scored = sorted(
            [{"domain": r["domain"], "score": _score(r)} for r in results if r.get("domain")],
            key=lambda x: -x["score"],
        )
        # Return domains with score > 0.5 (clearly related), up to 3
        return [s["domain"] for s in scored if s["score"] > 0.5][:3]

    except Exception as exc:
        logger.warning(f"Clearbit lookup failed: {exc}")
        return []


async def _ai_check_company_domain(email: str, company_name: str) -> dict:
    """
    Strategy (in order):
    1. Instant-reject free providers — no API call needed.
    2. Clearbit autocomplete — fast, accurate, free, no key.
       • If Clearbit returns known domains for the company → compare directly.
       • Match found  → verified.
       • No match     → tell user the correct domain from Clearbit data.
    3. AI fallback — used only when Clearbit has no results for the company
       (obscure startups, very new companies, etc.).

    Returns:
        {
          "match": bool,
          "entered_domain": str,
          "expected_domains": list[str],
          "reason": str,
          "is_free_provider": bool,
          "source": "free_provider" | "clearbit" | "ai" | "heuristic",
        }
    """
    entered_domain = email.split("@")[-1].lower().strip() if "@" in email else email.lower().strip()

    # ── Step 1: free-provider instant block ──────────────────────────────────
    if entered_domain in _FREE_DOMAINS:
        return {
            "match": False,
            "entered_domain": entered_domain,
            "expected_domains": [],
            "reason": f"{entered_domain} is a personal email provider. Please use your official work email.",
            "is_free_provider": True,
            "source": "free_provider",
        }

    # ── Step 2: name-match fast pass ─────────────────────────────────────────
    # Allow domains where the company name is clearly embedded, e.g.
    # "aspireapp.com" for company "Aspire" (aspire ⊆ aspireapp).
    company_slug = re.sub(r"[^a-z0-9]", "", company_name.lower())
    domain_base = re.sub(r"\.[^.]+$", "", entered_domain)  # strip TLD
    if len(company_slug) >= 4 and company_slug in domain_base:
        return {
            "match": True,
            "entered_domain": entered_domain,
            "expected_domains": [entered_domain],
            "reason": f"Domain '{entered_domain}' contains the company name '{company_name}' — verified.",
            "is_free_provider": False,
            "source": "name_match",
        }

    # ── Step 3: Clearbit lookup ───────────────────────────────────────────────
    clearbit_domains = await _clearbit_lookup(company_name)

    if clearbit_domains:
        match = entered_domain in clearbit_domains
        if match:
            reason = f"Domain verified — {entered_domain} is a known {company_name} email domain."
        else:
            domains_str = ", ".join(f"@{d}" for d in clearbit_domains)
            reason = (
                f"This domain doesn't match {company_name}'s official email domain(s). "
                f"Expected: {domains_str}"
            )
        return {
            "match": match,
            "entered_domain": entered_domain,
            "expected_domains": clearbit_domains,
            "reason": reason,
            "is_free_provider": False,
            "source": "clearbit",
        }

    # ── Step 3: AI fallback (company not in Clearbit — startup / new co) ─────
    logger.info(f"Clearbit had no results for '{company_name}', falling back to AI.")
    prompt = (
        f"A user claims to work at '{company_name}' and provided work email domain '{entered_domain}'.\n\n"
        f"Note: This company may be a startup or lesser-known company not in public databases.\n\n"
        f"Task:\n"
        f"1. Based on the company name, predict the most likely official email domain(s) employees use.\n"
        f"2. Decide if '{entered_domain}' matches.\n\n"
        f"Rules:\n"
        f"- Be strict: match=true only if domain clearly and directly corresponds to the company.\n"
        f"- For a company named 'AspireApp', domains like 'aspireapp.com' or 'aspire.app' are valid.\n"
        f"- Generic free providers (gmail, yahoo, etc.) should always be false.\n"
        f"- If you cannot determine the company's domain with confidence, set match=null and say so.\n\n"
        f"Respond with this exact JSON:\n"
        f'{{"match": true/false/null, "expected_domains": ["domain.com", ...], "reason": "one sentence"}}'
    )

    try:
        p = settings.AI_PROVIDER.lower()
        if p == "openai":
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            resp = await client.chat.completions.create(
                model="gpt-4o-mini",
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a corporate email domain expert. "
                            "Predict company email domains and verify if a given domain matches. "
                            "Respond with valid JSON only."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
            )
            data = json.loads(resp.choices[0].message.content)

        elif p == "claude":
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            resp = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = resp.content[0].text
            data = json.loads(raw[raw.find("{"):raw.rfind("}") + 1])

        else:
            # No AI provider — basic heuristic
            name_tokens = re.sub(r"[^a-z0-9]", "", company_name.lower())
            domain_base = re.sub(r"\.[^.]+$", "", entered_domain)  # strip TLD
            heuristic = name_tokens[:8] in domain_base or domain_base in name_tokens[:12]
            return {
                "match": heuristic,
                "entered_domain": entered_domain,
                "expected_domains": [],
                "reason": "Verified via name-matching heuristic (AI not configured).",
                "is_free_provider": False,
                "source": "heuristic",
            }

        ai_match = data.get("match")
        # If AI returns null/None (uncertain), don't block the user — let OTP be the final gate
        if ai_match is None:
            return {
                "match": True,
                "entered_domain": entered_domain,
                "expected_domains": data.get("expected_domains", []),
                "reason": "Could not confirm domain automatically — OTP verification will confirm ownership.",
                "is_free_provider": False,
                "source": "ai",
            }

        return {
            "match": bool(ai_match),
            "entered_domain": entered_domain,
            "expected_domains": data.get("expected_domains", []),
            "reason": data.get("reason", ""),
            "is_free_provider": False,
            "source": "ai",
        }

    except Exception as exc:
        logger.warning(f"AI domain check failed: {exc}")
        # Don't hard-block on AI failure — let OTP be the gate
        return {
            "match": True,
            "entered_domain": entered_domain,
            "expected_domains": [],
            "reason": "Could not verify domain automatically — OTP verification will confirm ownership.",
            "is_free_provider": False,
            "source": "ai",
        }


async def _ai_verify_domain(domain: str, company_name: str) -> bool:
    """Thin wrapper used by confirm-otp — returns bool only."""
    result = await _ai_check_company_domain(f"x@{domain}", company_name)
    return result["match"]


# ── Pool reranking ────────────────────────────────────────────────────────────

async def _rerank_referral(db: Session, post_id: int, pool_type: str) -> list[dict]:
    """Rank applications within pool or waitlist by match_score desc, applied_at asc."""
    active_statuses = {"pool": "in_pool", "waitlist": "in_waitlist"}
    active_status = active_statuses[pool_type]

    apps = (
        db.query(models.ReferralApplication)
        .filter(
            models.ReferralApplication.referral_post_id == post_id,
            models.ReferralApplication.pool_type == pool_type,
            models.ReferralApplication.status == active_status,
        )
        .order_by(
            models.ReferralApplication.match_score.desc(),
            models.ReferralApplication.applied_at.asc(),
        )
        .all()
    )
    if not apps:
        return []

    old_ranks = {a.id: a.rank for a in apps}
    for pos, app in enumerate(apps):
        app.rank = pos + 1
    db.commit()

    changes = []
    for app in apps:
        old = old_ranks.get(app.id)
        if old is not None and old != app.rank:
            changes.append({
                "app_id": app.id,
                "candidate_email": app.candidate.email if app.candidate else "",
                "candidate_name": app.candidate.full_name if app.candidate else "",
                "old_rank": old,
                "new_rank": app.rank,
                "pool_type": pool_type,
            })
    return changes


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class SendOTPRequest(BaseModel):
    work_email: str
    company_name: str


class ConfirmOTPRequest(BaseModel):
    work_email: str
    company_name: str
    otp_code: str


class CheckDomainRequest(BaseModel):
    work_email: str
    company_name: str


class CreateReferralPostRequest(BaseModel):
    title: str
    company_name: str
    link_type: str = "internal"           # "internal" | "external"
    job_id: Optional[int] = None
    external_job_url: Optional[str] = None
    jd_raw: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    min_match_score: float = 40.0
    pool_size: int = 15
    waitlist_size: int = 10


class UpdateReferralPostRequest(BaseModel):
    title: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    jd_raw: Optional[str] = None
    min_match_score: Optional[float] = None
    pool_size: Optional[int] = None
    waitlist_size: Optional[int] = None
    external_job_url: Optional[str] = None


class OpenReferralPostRequest(BaseModel):
    closes_at: Optional[datetime] = None   # optional custom; capped at +5 days


class ApplyReferralRequest(BaseModel):
    resume_text: Optional[str] = None      # if not provided, uses profile resume


class RemoveCandidateRequest(BaseModel):
    app_id: int


# ── Verification endpoints ────────────────────────────────────────────────────

@router.post("/verify/check-domain")
async def check_domain(req: CheckDomainRequest):
    """
    Public endpoint — no auth required.
    Called by the frontend in real-time (on email blur) to validate that the
    entered work email domain actually belongs to the claimed company.
    Returns the AI verdict with the expected domain(s) so the UI can show a
    helpful message instead of a generic error.
    """
    if not req.work_email or "@" not in req.work_email:
        return {"match": False, "entered_domain": "", "expected_domains": [], "reason": "Enter a valid email address.", "is_free_provider": False}
    if not req.company_name.strip():
        return {"match": False, "entered_domain": "", "expected_domains": [], "reason": "Enter a company name first.", "is_free_provider": False}

    result = await _ai_check_company_domain(req.work_email, req.company_name)
    return result


@router.post("/verify/send-otp")
async def send_otp(
    req: SendOTPRequest,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Block free-email providers before spending an OTP
    domain = req.work_email.split("@")[-1].lower() if "@" in req.work_email else ""
    if domain in _FREE_DOMAINS:
        raise HTTPException(400, "Please use your work email address, not a personal email.")

    otp_code = str(secrets.randbelow(900000) + 100000)  # 6-digit
    otp_hash = hashlib.sha256(otp_code.encode()).hexdigest()
    expires_at = datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES)

    # Invalidate previous OTPs for this user + email
    db.query(models.EmailVerificationOTP).filter(
        models.EmailVerificationOTP.user_id == current_user.id,
        models.EmailVerificationOTP.work_email == req.work_email,
    ).delete()

    otp_row = models.EmailVerificationOTP(
        user_id=current_user.id,
        work_email=req.work_email,
        otp_hash=otp_hash,
        expires_at=expires_at,
    )
    db.add(otp_row)
    db.commit()

    bg.add_task(
        send_referral_otp_email,
        req.work_email,
        current_user.full_name,
        otp_code,
        req.company_name,
    )
    return {"detail": f"OTP sent to {req.work_email}. Expires in {OTP_EXPIRY_MINUTES} minutes."}


@router.post("/verify/confirm-otp")
async def confirm_otp(
    req: ConfirmOTPRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    otp_hash = hashlib.sha256(req.otp_code.encode()).hexdigest()
    otp_row = (
        db.query(models.EmailVerificationOTP)
        .filter(
            models.EmailVerificationOTP.user_id == current_user.id,
            models.EmailVerificationOTP.work_email == req.work_email,
            models.EmailVerificationOTP.otp_hash == otp_hash,
            models.EmailVerificationOTP.used == False,
        )
        .first()
    )
    if not otp_row:
        raise HTTPException(400, "Invalid OTP code.")
    if datetime.utcnow() > otp_row.expires_at:
        raise HTTPException(400, "OTP has expired. Please request a new one.")

    domain = req.work_email.split("@")[-1].lower()
    domain_match = await _ai_verify_domain(domain, req.company_name)
    if not domain_match:
        raise HTTPException(400, f"The email domain '{domain}' does not appear to belong to '{req.company_name}'. Please use your official work email.")

    otp_row.used = True
    db.commit()
    return {
        "verified": True,
        "work_email": req.work_email,
        "domain": domain,
        "company_name": req.company_name,
        "verification_method": "work_email",
    }


# ── Referral Post CRUD ────────────────────────────────────────────────────────

@router.post("/posts")
async def create_referral_post(
    req: CreateReferralPostRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Determine company_verified from LinkedIn or explicitly set later via OTP
    linkedin_verified_company = (
        current_user.linkedin_verified
        and current_user.company
        and current_user.company.lower().strip() == req.company_name.lower().strip()
    )

    # Resolve JD for internal link
    jd_raw = req.jd_raw
    title = req.title
    location = req.location
    employment_type = req.employment_type

    if req.link_type == "internal" and req.job_id:
        job = db.query(models.Job).filter(models.Job.id == req.job_id, models.Job.status == "published").first()
        if not job:
            raise HTTPException(404, "Job not found or not published.")
        jd_raw = jd_raw or job.jd_text
        title = title or job.title
        location = location or job.location
        employment_type = employment_type or job.employment_type

    if not jd_raw:
        raise HTTPException(400, "JD content is required (either link an internal job or provide jd_raw).")

    # Validate pool settings
    pool_size = max(5, min(30, req.pool_size))
    waitlist_size = max(0, min(20, req.waitlist_size))

    slug = _unique_slug(db, _slugify(f"{req.title}-{req.company_name}-{secrets.token_hex(3)}"))

    post = models.ReferralPost(
        slug=slug,
        referrer_user_id=current_user.id,
        company_name=req.company_name,
        company_verified=linkedin_verified_company,
        verification_method="linkedin" if linkedin_verified_company else None,
        link_type=req.link_type,
        job_id=req.job_id if req.link_type == "internal" else None,
        external_job_url=req.external_job_url if req.link_type == "external" else None,
        jd_raw=jd_raw,
        title=title,
        location=location,
        employment_type=employment_type,
        min_match_score=req.min_match_score,
        pool_size=pool_size,
        waitlist_size=waitlist_size,
        status="draft",
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return _post_response(post, db)


@router.get("/posts/my")
async def my_referral_posts(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    posts = (
        db.query(models.ReferralPost)
        .filter(models.ReferralPost.referrer_user_id == current_user.id)
        .order_by(models.ReferralPost.created_at.desc())
        .all()
    )
    return [_post_response(p, db) for p in posts]


@router.get("/posts/{post_id}")
async def get_referral_post(
    post_id: int,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
):
    post = db.query(models.ReferralPost).filter(models.ReferralPost.id == post_id).first()
    if not post:
        raise HTTPException(404, "Referral post not found.")
    await _maybe_auto_close(post, db, bg)
    return _post_response(post, db)


@router.get("/posts/by-slug/{slug}")
async def get_referral_post_by_slug(
    slug: str,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
):
    post = db.query(models.ReferralPost).filter(models.ReferralPost.slug == slug).first()
    if not post:
        raise HTTPException(404, "Referral post not found.")
    await _maybe_auto_close(post, db, bg)
    return _post_response(post, db)


@router.patch("/posts/{post_id}")
async def update_referral_post(
    post_id: int,
    req: UpdateReferralPostRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    post = _get_own_post(post_id, current_user, db)
    if post.status != "draft":
        raise HTTPException(400, "Only draft posts can be edited.")

    if req.title is not None:
        post.title = req.title
    if req.location is not None:
        post.location = req.location
    if req.employment_type is not None:
        post.employment_type = req.employment_type
    if req.jd_raw is not None:
        post.jd_raw = req.jd_raw
        post.jd_requirements = None  # force re-parse
    if req.min_match_score is not None:
        post.min_match_score = req.min_match_score
    if req.pool_size is not None:
        post.pool_size = max(5, min(30, req.pool_size))
    if req.waitlist_size is not None:
        post.waitlist_size = max(0, min(20, req.waitlist_size))
    if req.external_job_url is not None:
        post.external_job_url = req.external_job_url

    db.commit()
    db.refresh(post)
    return _post_response(post, db)


@router.post("/posts/{post_id}/verify-work-email")
async def verify_work_email_for_post(
    post_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Mark post as company_verified after successful OTP confirmation."""
    post = _get_own_post(post_id, current_user, db)
    work_email = payload.get("work_email", "")
    company_name = payload.get("company_name", "")

    if not work_email or not company_name:
        raise HTTPException(400, "work_email and company_name are required.")

    domain = work_email.split("@")[-1].lower()
    # Trust the confirmation — the /verify/confirm-otp endpoint already ran AI check
    post.company_verified = True
    post.verification_method = "work_email"
    post.work_email_domain = domain
    db.commit()
    return {"verified": True}


@router.post("/posts/{post_id}/open")
async def open_referral_post(
    post_id: int,
    req: OpenReferralPostRequest,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    post = _get_own_post(post_id, current_user, db)
    if post.status != "draft":
        raise HTTPException(400, "Only draft posts can be opened.")
    if not post.company_verified:
        raise HTTPException(400, "Company must be verified before opening the referral post.")

    now = datetime.utcnow()
    max_close = now + timedelta(days=MAX_CLOSE_DAYS)

    if req.closes_at:
        if req.closes_at > max_close:
            raise HTTPException(400, f"Close date cannot be more than {MAX_CLOSE_DAYS} days from now.")
        closes_at = req.closes_at
    else:
        closes_at = max_close

    post.status = "open"
    post.opens_at = now
    post.closes_at = closes_at
    db.commit()
    db.refresh(post)

    # Trigger JD parsing in background if not already done
    if post.jd_raw and not post.jd_requirements:
        bg.add_task(_parse_and_store_jd, post.id, post.jd_raw)

    return _post_response(post, db)


@router.post("/posts/{post_id}/close")
async def close_referral_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    post = _get_own_post(post_id, current_user, db)
    if post.status != "open":
        raise HTTPException(400, "Only open posts can be manually closed.")
    post.status = "closed"
    db.commit()
    db.refresh(post)
    return _post_response(post, db)


@router.post("/posts/{post_id}/referring")
async def mark_referring(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    post = _get_own_post(post_id, current_user, db)
    if post.status != "closed":
        raise HTTPException(400, "Post must be closed before marking as referring.")
    post.status = "referring"
    db.commit()
    db.refresh(post)
    return _post_response(post, db)


@router.post("/posts/{post_id}/referred-all")
async def mark_referred_all(
    post_id: int,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    post = _get_own_post(post_id, current_user, db)
    if post.status not in ("closed", "referring"):
        raise HTTPException(400, "Post must be in closed or referring state.")

    now = datetime.utcnow()
    pool_apps = (
        db.query(models.ReferralApplication)
        .filter(
            models.ReferralApplication.referral_post_id == post.id,
            models.ReferralApplication.status == "in_pool",
        )
        .all()
    )
    for app in pool_apps:
        app.status = "referred"
        app.referred_at = now

    waitlist_apps = (
        db.query(models.ReferralApplication)
        .filter(
            models.ReferralApplication.referral_post_id == post.id,
            models.ReferralApplication.status == "in_waitlist",
        )
        .all()
    )

    post.status = "referred_all"
    db.commit()

    # Send referred emails to pool candidates
    referrer = post.referrer
    for app in pool_apps:
        if app.candidate:
            bg.add_task(
                send_referral_referred_email,
                app.candidate.email,
                app.candidate.full_name,
                post.title,
                post.company_name,
                referrer.full_name if referrer else "Referrer",
                referrer.company or post.company_name if referrer else post.company_name,
            )
    # Send not-referred emails to waitlist
    for app in waitlist_apps:
        if app.candidate:
            bg.add_task(
                send_referral_pool_closed_not_referred_email,
                app.candidate.email,
                app.candidate.full_name,
                post.title,
                post.company_name,
                referrer.full_name if referrer else "Referrer",
                True,
            )

    return _post_response(post, db)


@router.delete("/posts/{post_id}/candidates/{app_id}")
async def remove_candidate_from_pool(
    post_id: int,
    app_id: int,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    post = _get_own_post(post_id, current_user, db)
    if post.status not in ("open", "closed", "referring"):
        raise HTTPException(400, "Cannot remove candidates from this post in its current state.")

    app = db.query(models.ReferralApplication).filter(
        models.ReferralApplication.id == app_id,
        models.ReferralApplication.referral_post_id == post_id,
    ).first()
    if not app:
        raise HTTPException(404, "Application not found.")
    if app.status not in ("in_pool", "in_waitlist"):
        raise HTTPException(400, "Candidate is not in an active pool/waitlist.")

    pool_type = app.pool_type
    app.status = "displaced"
    app.displaced_at = datetime.utcnow()
    db.commit()

    # Promote top waitlist to pool if pool spot freed
    if pool_type == "pool":
        _promote_from_waitlist(post, db, bg)

    await _rerank_referral(db, post_id, pool_type)
    return {"detail": "Candidate removed from pool."}


# ── Application (candidate) ───────────────────────────────────────────────────

@router.post("/posts/{post_id}/apply")
async def apply_to_referral(
    post_id: int,
    req: ApplyReferralRequest,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != "candidate":
        raise HTTPException(403, "Only candidates can apply to referral posts.")

    post = db.query(models.ReferralPost).filter(models.ReferralPost.id == post_id).first()
    if not post:
        raise HTTPException(404, "Referral post not found.")

    await _maybe_auto_close(post, db, bg)

    if post.status != "open":
        raise HTTPException(400, "This referral post is not open for applications.")

    # Already applied check
    existing = db.query(models.ReferralApplication).filter(
        models.ReferralApplication.referral_post_id == post_id,
        models.ReferralApplication.candidate_user_id == current_user.id,
    ).first()
    if existing:
        raise HTTPException(400, "You have already applied to this referral post.")

    # Candidate lock — check if already in active pool/waitlist at same company
    locked = (
        db.query(models.ReferralApplication)
        .join(models.ReferralPost, models.ReferralApplication.referral_post_id == models.ReferralPost.id)
        .filter(
            models.ReferralApplication.candidate_user_id == current_user.id,
            models.ReferralApplication.status.in_(["in_pool", "in_waitlist"]),
            models.ReferralPost.company_name == post.company_name,
            models.ReferralPost.id != post_id,
        )
        .first()
    )
    if locked:
        raise HTTPException(400, {
            "code": "locked",
            "detail": f"You are already in an active referral pool at {post.company_name}. You can apply to other referral posts once your current pool closes or you are displaced.",
        })

    # Resolve resume
    resume_text = req.resume_text or current_user.resume_text
    if not resume_text:
        raise HTTPException(400, "No resume found. Please upload a resume to your profile.")

    # Score against JD
    jd_text = post.jd_raw or ""
    screening = await screen_resume(jd_text, resume_text, post.title)
    match_score = screening.get("match_score", 0.0)

    referrer = post.referrer

    # Instant rejection — below threshold
    if match_score < post.min_match_score:
        bg.add_task(
            send_referral_pool_rejection_email,
            current_user.email,
            current_user.full_name,
            post.title,
            post.company_name,
            referrer.full_name if referrer else "Referrer",
            match_score,
            "low_score",
        )
        return {
            "result": "rejected",
            "reason": "low_score",
            "match_score": match_score,
            "min_match_score": post.min_match_score,
            "detail": f"Your profile score ({match_score:.1f}%) did not meet the minimum qualification threshold ({post.min_match_score:.1f}%) for this referral.",
        }

    # Count current pool / waitlist
    pool_count = db.query(models.ReferralApplication).filter(
        models.ReferralApplication.referral_post_id == post_id,
        models.ReferralApplication.pool_type == "pool",
        models.ReferralApplication.status == "in_pool",
    ).count()

    waitlist_count = db.query(models.ReferralApplication).filter(
        models.ReferralApplication.referral_post_id == post_id,
        models.ReferralApplication.pool_type == "waitlist",
        models.ReferralApplication.status == "in_waitlist",
    ).count()

    # Pool has room
    if pool_count < post.pool_size:
        app = models.ReferralApplication(
            referral_post_id=post_id,
            candidate_user_id=current_user.id,
            resume_text=resume_text,
            match_score=match_score,
            pool_type="pool",
            status="in_pool",
        )
        db.add(app)
        db.commit()

        changes = await _rerank_referral(db, post_id, "pool")
        db.refresh(app)

        bg.add_task(
            send_referral_pool_accepted_email,
            current_user.email, current_user.full_name, post.title, post.company_name,
            referrer.full_name if referrer else "Referrer",
            referrer.company or post.company_name if referrer else post.company_name,
            app.rank or 1, post.pool_size, match_score,
        )
        _notify_rank_changes(changes, post, db, bg)
        _check_pool_nearing_full(post, db, bg, pool_count + 1)

        return {
            "result": "pool_accepted",
            "match_score": match_score,
            "rank": app.rank,
            "pool_size": post.pool_size,
            "pool_type": "pool",
        }

    # Pool is full — can we displace lowest?
    lowest_pool = (
        db.query(models.ReferralApplication)
        .filter(
            models.ReferralApplication.referral_post_id == post_id,
            models.ReferralApplication.pool_type == "pool",
            models.ReferralApplication.status == "in_pool",
        )
        .order_by(
            models.ReferralApplication.match_score.asc(),
            models.ReferralApplication.applied_at.desc(),
        )
        .first()
    )

    if lowest_pool and match_score > lowest_pool.match_score:
        # Displace from pool
        displaced_score = lowest_pool.match_score
        displaced_candidate = lowest_pool.candidate
        lowest_pool.status = "displaced"
        lowest_pool.displaced_at = datetime.utcnow()
        db.commit()

        if displaced_candidate:
            bg.add_task(
                send_referral_displacement_email,
                displaced_candidate.email, displaced_candidate.full_name,
                post.title, post.company_name,
                referrer.full_name if referrer else "Referrer",
                "pool", displaced_score,
            )

        # Try to promote displaced pool member to waitlist
        _move_displaced_to_waitlist(lowest_pool, post, db)

        app = models.ReferralApplication(
            referral_post_id=post_id,
            candidate_user_id=current_user.id,
            resume_text=resume_text,
            match_score=match_score,
            pool_type="pool",
            status="in_pool",
        )
        db.add(app)
        db.commit()

        changes = await _rerank_referral(db, post_id, "pool")
        db.refresh(app)

        bg.add_task(
            send_referral_pool_accepted_email,
            current_user.email, current_user.full_name, post.title, post.company_name,
            referrer.full_name if referrer else "Referrer",
            referrer.company or post.company_name if referrer else post.company_name,
            app.rank or 1, post.pool_size, match_score,
        )
        _notify_rank_changes(changes, post, db, bg)

        return {
            "result": "pool_accepted",
            "displaced": True,
            "match_score": match_score,
            "rank": app.rank,
            "pool_type": "pool",
        }

    # Pool full — try waitlist
    if waitlist_count < post.waitlist_size:
        app = models.ReferralApplication(
            referral_post_id=post_id,
            candidate_user_id=current_user.id,
            resume_text=resume_text,
            match_score=match_score,
            pool_type="waitlist",
            status="in_waitlist",
        )
        db.add(app)
        db.commit()

        changes = await _rerank_referral(db, post_id, "waitlist")
        db.refresh(app)

        bg.add_task(
            send_referral_waitlist_accepted_email,
            current_user.email, current_user.full_name, post.title, post.company_name,
            referrer.full_name if referrer else "Referrer",
            referrer.company or post.company_name if referrer else post.company_name,
            app.rank or 1, match_score,
        )
        _notify_rank_changes(changes, post, db, bg)

        return {
            "result": "waitlisted",
            "match_score": match_score,
            "waitlist_rank": app.rank,
            "pool_type": "waitlist",
        }

    # Waitlist full — can we displace lowest on waitlist?
    lowest_waitlist = (
        db.query(models.ReferralApplication)
        .filter(
            models.ReferralApplication.referral_post_id == post_id,
            models.ReferralApplication.pool_type == "waitlist",
            models.ReferralApplication.status == "in_waitlist",
        )
        .order_by(
            models.ReferralApplication.match_score.asc(),
            models.ReferralApplication.applied_at.desc(),
        )
        .first()
    )

    if lowest_waitlist and match_score > lowest_waitlist.match_score:
        displaced_score = lowest_waitlist.match_score
        displaced_candidate = lowest_waitlist.candidate
        lowest_waitlist.status = "displaced"
        lowest_waitlist.displaced_at = datetime.utcnow()
        db.commit()

        if displaced_candidate:
            bg.add_task(
                send_referral_displacement_email,
                displaced_candidate.email, displaced_candidate.full_name,
                post.title, post.company_name,
                referrer.full_name if referrer else "Referrer",
                "waitlist", displaced_score,
            )

        app = models.ReferralApplication(
            referral_post_id=post_id,
            candidate_user_id=current_user.id,
            resume_text=resume_text,
            match_score=match_score,
            pool_type="waitlist",
            status="in_waitlist",
        )
        db.add(app)
        db.commit()

        changes = await _rerank_referral(db, post_id, "waitlist")
        db.refresh(app)

        bg.add_task(
            send_referral_waitlist_accepted_email,
            current_user.email, current_user.full_name, post.title, post.company_name,
            referrer.full_name if referrer else "Referrer",
            referrer.company or post.company_name if referrer else post.company_name,
            app.rank or 1, match_score,
        )
        _notify_rank_changes(changes, post, db, bg)

        return {
            "result": "waitlisted",
            "displaced": True,
            "match_score": match_score,
            "waitlist_rank": app.rank,
            "pool_type": "waitlist",
        }

    # Both full and not competitive enough
    bg.add_task(
        send_referral_pool_rejection_email,
        current_user.email, current_user.full_name, post.title, post.company_name,
        referrer.full_name if referrer else "Referrer",
        match_score, "pool_full",
    )
    return {
        "result": "rejected",
        "reason": "pool_full",
        "match_score": match_score,
        "detail": "Both the referral pool and waitlist are full and your score was not high enough to displace a current member.",
    }


@router.get("/my-applications")
async def my_referral_applications(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != "candidate":
        raise HTTPException(403, "Candidates only.")
    apps = (
        db.query(models.ReferralApplication)
        .filter(models.ReferralApplication.candidate_user_id == current_user.id)
        .order_by(models.ReferralApplication.applied_at.desc())
        .all()
    )
    result = []
    for app in apps:
        post = app.referral_post
        result.append({
            "id": app.id,
            "referral_post_id": app.referral_post_id,
            "post_title": post.title if post else None,
            "company_name": post.company_name if post else None,
            "match_score": app.match_score,
            "rank": app.rank,
            "pool_type": app.pool_type,
            "status": app.status,
            "applied_at": app.applied_at.isoformat() if app.applied_at else None,
            "post_status": post.status if post else None,
            "post_slug": post.slug if post else None,
        })
    return result


# ── Pool / Dashboard (referrer) ───────────────────────────────────────────────

@router.get("/posts/{post_id}/pool")
async def get_pool(
    post_id: int,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    post = _get_own_post(post_id, current_user, db)
    await _maybe_auto_close(post, db, bg)

    pool_apps = (
        db.query(models.ReferralApplication)
        .filter(
            models.ReferralApplication.referral_post_id == post_id,
            models.ReferralApplication.pool_type == "pool",
            models.ReferralApplication.status.in_(["in_pool", "referred"]),
        )
        .order_by(models.ReferralApplication.rank.asc())
        .all()
    )

    waitlist_apps = (
        db.query(models.ReferralApplication)
        .filter(
            models.ReferralApplication.referral_post_id == post_id,
            models.ReferralApplication.pool_type == "waitlist",
            models.ReferralApplication.status == "in_waitlist",
        )
        .order_by(models.ReferralApplication.rank.asc())
        .all()
    )

    def _app_dict(app: models.ReferralApplication) -> dict:
        c = app.candidate
        return {
            "id": app.id,
            "rank": app.rank,
            "match_score": app.match_score,
            "status": app.status,
            "pool_type": app.pool_type,
            "applied_at": app.applied_at.isoformat() if app.applied_at else None,
            "candidate": {
                "id": c.id if c else None,
                "full_name": c.full_name if c else "Unknown",
                "email": c.email if c else "",
                "college_name": c.college_name if c else None,
                "college_logo_url": c.college_logo_url if c else None,
                "current_company": c.current_company if c else None,
                "candidate_linkedin_url": c.candidate_linkedin_url if c else None,
            } if c else None,
        }

    all_pool = [_app_dict(a) for a in pool_apps]
    all_waitlist = [_app_dict(a) for a in waitlist_apps]

    total_applicants = db.query(models.ReferralApplication).filter(
        models.ReferralApplication.referral_post_id == post_id
    ).count()

    return {
        "post": _post_response(post, db),
        "pool": all_pool,
        "waitlist": all_waitlist,
        "stats": {
            "total_applicants": total_applicants,
            "pool_count": len(all_pool),
            "pool_capacity": post.pool_size,
            "waitlist_count": len(all_waitlist),
            "waitlist_capacity": post.waitlist_size,
        },
    }


# ── Discovery (public) ────────────────────────────────────────────────────────

@router.get("/companies")
async def list_referral_companies(db: Session = Depends(get_db)):
    """List all companies that have open referral posts."""
    open_posts = (
        db.query(models.ReferralPost)
        .filter(models.ReferralPost.status == "open")
        .all()
    )
    company_map: dict[str, dict] = {}
    for post in open_posts:
        name = post.company_name
        if name not in company_map:
            company_map[name] = {"company_name": name, "post_count": 0, "job_titles": set()}
        company_map[name]["post_count"] += 1
        company_map[name]["job_titles"].add(post.title)

    return [
        {
            "company_name": v["company_name"],
            "open_referral_count": v["post_count"],
            "job_titles": list(v["job_titles"])[:5],
        }
        for v in sorted(company_map.values(), key=lambda x: -x["post_count"])
    ]


@router.get("/company/{company_name}")
async def get_company_referrals(
    company_name: str,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """All open referral posts for a company, grouped by job title."""
    posts = (
        db.query(models.ReferralPost)
        .filter(
            models.ReferralPost.company_name == company_name,
            models.ReferralPost.status == "open",
        )
        .order_by(models.ReferralPost.opens_at.desc())
        .all()
    )

    for post in posts:
        await _maybe_auto_close(post, db, bg)

    # Re-fetch after potential auto-closes
    posts = [p for p in posts if p.status == "open"]

    grouped: dict[str, list] = {}
    for post in posts:
        key = post.title
        if key not in grouped:
            grouped[key] = []
        grouped[key].append(_post_public_summary(post, db))

    return {
        "company_name": company_name,
        "jobs": [
            {"title": title, "referrers": referrers}
            for title, referrers in grouped.items()
        ],
    }


# ── Internal helpers ──────────────────────────────────────────────────────────

def _get_own_post(post_id: int, user: models.User, db: Session) -> models.ReferralPost:
    post = db.query(models.ReferralPost).filter(models.ReferralPost.id == post_id).first()
    if not post:
        raise HTTPException(404, "Referral post not found.")
    if post.referrer_user_id != user.id:
        raise HTTPException(403, "Not your referral post.")
    return post


def _post_response(post: models.ReferralPost, db: Session) -> dict:
    referrer = post.referrer
    pool_count = db.query(models.ReferralApplication).filter(
        models.ReferralApplication.referral_post_id == post.id,
        models.ReferralApplication.status == "in_pool",
    ).count()
    waitlist_count = db.query(models.ReferralApplication).filter(
        models.ReferralApplication.referral_post_id == post.id,
        models.ReferralApplication.status == "in_waitlist",
    ).count()
    return {
        "id": post.id,
        "slug": post.slug,
        "title": post.title,
        "company_name": post.company_name,
        "company_verified": post.company_verified,
        "verification_method": post.verification_method,
        "link_type": post.link_type,
        "job_id": post.job_id,
        "external_job_url": post.external_job_url,
        "location": post.location,
        "employment_type": post.employment_type,
        "jd_raw": post.jd_raw,
        "jd_requirements": json.loads(post.jd_requirements) if post.jd_requirements else None,
        "min_match_score": post.min_match_score,
        "pool_size": post.pool_size,
        "waitlist_size": post.waitlist_size,
        "status": post.status,
        "opens_at": post.opens_at.isoformat() if post.opens_at else None,
        "closes_at": post.closes_at.isoformat() if post.closes_at else None,
        "created_at": post.created_at.isoformat() if post.created_at else None,
        "pool_count": pool_count,
        "waitlist_count": waitlist_count,
        "spots_remaining": max(0, post.pool_size - pool_count),
        "referrer": {
            "id": referrer.id,
            "full_name": referrer.full_name,
            "company": referrer.company or post.company_name,
            "linkedin_verified": referrer.linkedin_verified,
            "current_company": referrer.current_company,
            "candidate_linkedin_url": referrer.candidate_linkedin_url,
        } if referrer else None,
    }


def _post_public_summary(post: models.ReferralPost, db: Session) -> dict:
    referrer = post.referrer
    pool_count = db.query(models.ReferralApplication).filter(
        models.ReferralApplication.referral_post_id == post.id,
        models.ReferralApplication.status == "in_pool",
    ).count()
    return {
        "id": post.id,
        "slug": post.slug,
        "title": post.title,
        "location": post.location,
        "employment_type": post.employment_type,
        "pool_size": post.pool_size,
        "spots_remaining": max(0, post.pool_size - pool_count),
        "closes_at": post.closes_at.isoformat() if post.closes_at else None,
        "status": post.status,
        "referrer": {
            "id": referrer.id,
            "full_name": referrer.full_name,
            "company": referrer.company or post.company_name,
            "current_company": referrer.current_company,
            "candidate_linkedin_url": referrer.candidate_linkedin_url,
        } if referrer else None,
    }


def _notify_rank_changes(changes: list[dict], post: models.ReferralPost, db: Session, bg: BackgroundTasks) -> None:
    for change in changes:
        bg.add_task(
            send_referral_rank_change_email,
            change["candidate_email"],
            change["candidate_name"],
            post.title,
            post.company_name,
            change["old_rank"],
            change["new_rank"],
            change["pool_type"],
        )


def _check_pool_nearing_full(post: models.ReferralPost, db: Session, bg: BackgroundTasks, current_count: int) -> None:
    threshold = int(post.pool_size * 0.8)
    if current_count == threshold and post.referrer:
        bg.add_task(
            send_referral_pool_nearing_full_email,
            post.referrer.email,
            post.referrer.full_name,
            post.title,
            post.company_name,
            current_count,
            post.pool_size,
            post.slug or str(post.id),
            settings.FRONTEND_URL,
        )


def _promote_from_waitlist(post: models.ReferralPost, db: Session, bg: BackgroundTasks) -> None:
    """Move highest-ranked waitlist member to pool if pool has a free spot."""
    pool_count = db.query(models.ReferralApplication).filter(
        models.ReferralApplication.referral_post_id == post.id,
        models.ReferralApplication.status == "in_pool",
    ).count()
    if pool_count >= post.pool_size:
        return

    top_waitlist = (
        db.query(models.ReferralApplication)
        .filter(
            models.ReferralApplication.referral_post_id == post.id,
            models.ReferralApplication.pool_type == "waitlist",
            models.ReferralApplication.status == "in_waitlist",
        )
        .order_by(models.ReferralApplication.match_score.desc())
        .first()
    )
    if not top_waitlist:
        return

    top_waitlist.pool_type = "pool"
    top_waitlist.status = "in_pool"
    db.commit()

    if top_waitlist.candidate:
        bg.add_task(
            send_referral_pool_accepted_email,
            top_waitlist.candidate.email,
            top_waitlist.candidate.full_name,
            post.title,
            post.company_name,
            post.referrer.full_name if post.referrer else "Referrer",
            post.company_name,
            top_waitlist.rank or 1,
            post.pool_size,
            top_waitlist.match_score,
        )


def _move_displaced_to_waitlist(app: models.ReferralApplication, post: models.ReferralPost, db: Session) -> None:
    """Give displaced pool member a waitlist spot if available."""
    waitlist_count = db.query(models.ReferralApplication).filter(
        models.ReferralApplication.referral_post_id == post.id,
        models.ReferralApplication.status == "in_waitlist",
    ).count()
    if waitlist_count >= post.waitlist_size:
        return
    app.pool_type = "waitlist"
    app.status = "in_waitlist"
    app.displaced_at = None
    db.commit()


async def _parse_and_store_jd(post_id: int, jd_raw: str) -> None:
    """Background: parse JD and store requirements on the referral post."""
    from database import SessionLocal as _SL
    try:
        from services.ai_service import parse_jd_requirements
        result = await parse_jd_requirements(jd_raw, "")
        with _SL() as s:
            post = s.query(models.ReferralPost).filter(models.ReferralPost.id == post_id).first()
            if post:
                post.jd_requirements = json.dumps(result)
                s.commit()
    except Exception as exc:
        logger.warning(f"JD parse failed for referral post {post_id}: {exc}")
