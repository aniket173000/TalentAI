import logging
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

import models
from config import settings
from database import get_db
from services.auth_service import create_access_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth/linkedin", tags=["linkedin-auth"])

_AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization"
_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
_USERINFO_URL = "https://api.linkedin.com/v2/userinfo"
_SCOPES = "openid profile email"


def _fe(path: str) -> str:
    return f"{settings.FRONTEND_URL}{path}"


# ── Step 1: Redirect user to LinkedIn ────────────────────────────────────────

@router.get("/authorize")
def linkedin_authorize(role: str = Query(..., pattern="^(recruiter|candidate)$")):
    if not settings.LINKEDIN_CLIENT_ID:
        raise HTTPException(status_code=503, detail="LinkedIn OAuth is not configured on this server.")

    state = f"{role}|{secrets.token_urlsafe(16)}"
    params = {
        "response_type": "code",
        "client_id": settings.LINKEDIN_CLIENT_ID,
        "redirect_uri": settings.LINKEDIN_REDIRECT_URI,
        "scope": _SCOPES,
        "state": state,
    }
    return RedirectResponse(url=f"{_AUTHORIZE_URL}?{urlencode(params)}")


# ── Step 2: Handle callback from LinkedIn ────────────────────────────────────

@router.get("/callback")
async def linkedin_callback(
    code: str = Query(default=None),
    state: str = Query(default=None),
    error: str = Query(default=None),
    error_description: str = Query(default=None),
    db: Session = Depends(get_db),
):
    if error:
        desc = error_description or error
        logger.warning("LinkedIn OAuth error: %s", desc)
        return RedirectResponse(url=_fe(f"/auth/linkedin/callback?error={desc}"))

    if not code or not state:
        return RedirectResponse(url=_fe("/auth/linkedin/callback?error=missing_params"))

    # Parse role from state  (format: "recruiter|<nonce>")
    try:
        role = state.split("|")[0]
        if role not in ("recruiter", "candidate"):
            raise ValueError
    except (IndexError, ValueError):
        return RedirectResponse(url=_fe("/auth/linkedin/callback?error=invalid_state"))

    # Exchange authorisation code for access token
    async with httpx.AsyncClient(timeout=10) as client:
        token_resp = await client.post(
            _TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.LINKEDIN_REDIRECT_URI,
                "client_id": settings.LINKEDIN_CLIENT_ID,
                "client_secret": settings.LINKEDIN_CLIENT_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if token_resp.status_code != 200:
        logger.error("LinkedIn token exchange failed: %s", token_resp.text)
        return RedirectResponse(url=_fe("/auth/linkedin/callback?error=token_exchange_failed"))

    access_token = token_resp.json().get("access_token")

    # Fetch the OpenID Connect user profile
    async with httpx.AsyncClient(timeout=10) as client:
        ui_resp = await client.get(
            _USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if ui_resp.status_code != 200:
        logger.error("LinkedIn userinfo failed: %s", ui_resp.text)
        return RedirectResponse(url=_fe("/auth/linkedin/callback?error=userinfo_failed"))

    userinfo = ui_resp.json()
    linkedin_id: str = userinfo.get("sub", "")
    email: str = userinfo.get("email", "")
    given = userinfo.get("given_name", "")
    family = userinfo.get("family_name", "")
    full_name: str = userinfo.get("name") or f"{given} {family}".strip() or email

    if not linkedin_id or not email:
        return RedirectResponse(url=_fe("/auth/linkedin/callback?error=missing_profile_data"))

    # ── Find or create the user ───────────────────────────────────────────────

    # 1. Exact match by linkedin_id + role (returning user)
    user = db.query(models.User).filter(
        models.User.linkedin_id == linkedin_id,
        models.User.role == role,
    ).first()

    # 2. Match by email + role — link LinkedIn to an existing email/password account
    if not user:
        user = db.query(models.User).filter(
            models.User.email == email,
            models.User.role == role,
        ).first()
        if user:
            user.linkedin_id = linkedin_id
            user.linkedin_verified = True

    # 3. Brand new user — create the account
    if not user:
        user = models.User(
            email=email,
            hashed_password=None,
            full_name=full_name,
            role=role,
            linkedin_id=linkedin_id,
            linkedin_verified=True,
            is_active=True,
        )
        db.add(user)
    else:
        user.linkedin_verified = True

    db.commit()
    db.refresh(user)

    jwt = create_access_token(user.id, user.role)

    # Signal the frontend to collect the recruiter's company if not yet on file
    needs_company = "true" if (role == "recruiter" and not user.company) else "false"
    redirect = _fe(
        f"/auth/linkedin/callback?token={jwt}&role={role}&needs_company={needs_company}"
    )
    return RedirectResponse(url=redirect)


# ── Profile update (company / third-party flag) ───────────────────────────────

from fastapi import Depends as _Dep
from routers.auth import get_current_user

class RecruiterProfileUpdate:
    company: str | None = None
    is_third_party_recruiter: bool | None = None

from pydantic import BaseModel

class _ProfileUpdate(BaseModel):
    company: str | None = None
    is_third_party_recruiter: bool | None = None


@router.patch("/profile", tags=["auth"])
def update_linkedin_profile(
    body: _ProfileUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Let a LinkedIn-authenticated recruiter set/update their company name."""
    if body.company is not None:
        current_user.company = body.company.strip() or None
    if body.is_third_party_recruiter is not None:
        current_user.is_third_party_recruiter = body.is_third_party_recruiter
    db.commit()
    db.refresh(current_user)
    return {
        "id": current_user.id,
        "company": current_user.company,
        "is_third_party_recruiter": current_user.is_third_party_recruiter,
        "linkedin_verified": current_user.linkedin_verified,
    }
