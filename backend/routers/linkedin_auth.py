import logging
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from config import settings
from database import get_db
from routers.auth import get_current_user, _load_user_full
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
def linkedin_authorize(
    account_type: str = Query(..., pattern="^(recruiter|candidate)$"),
):
    """
    Kick off the LinkedIn OAuth flow.
    account_type tells us which extension to create/verify after callback.
    """
    if not settings.LINKEDIN_CLIENT_ID:
        raise HTTPException(status_code=503, detail="LinkedIn OAuth is not configured on this server.")

    # Embed account_type in the opaque state so the callback can read it back
    state = f"{account_type}|{secrets.token_urlsafe(16)}"
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

    # Parse account_type from state  (format: "candidate|<nonce>")
    try:
        account_type = state.split("|")[0]
        if account_type not in ("recruiter", "candidate"):
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

    # ── Find or create the user (unified identity — no role column) ───────────

    # 1. Returning user — match by linkedin_id
    user = (
        db.query(models.User)
        .filter(models.User.linkedin_id == linkedin_id)
        .first()
    )

    # 2. Existing email/password account — link LinkedIn to it
    if not user:
        user = db.query(models.User).filter(models.User.email == email).first()
        if user:
            user.linkedin_id = linkedin_id
            user.linkedin_verified = True

    # 3. Brand new user — create the account
    if not user:
        user = models.User(
            email=email,
            hashed_password=None,
            full_name=full_name,
            linkedin_id=linkedin_id,
            linkedin_verified=True,
            is_active=True,
        )
        db.add(user)
        db.flush()
    else:
        user.linkedin_verified = True

    # Ensure the requested capability extension exists
    if account_type == "recruiter":
        existing_ext = db.query(models.RecruiterExtension).filter(
            models.RecruiterExtension.user_id == user.id
        ).first()
        if not existing_ext:
            db.add(models.RecruiterExtension(user_id=user.id))
    else:
        existing_ext = db.query(models.CandidateExtension).filter(
            models.CandidateExtension.user_id == user.id
        ).first()
        if not existing_ext:
            db.add(models.CandidateExtension(user_id=user.id))

    db.commit()

    user = _load_user_full(user.id, db)
    jwt = create_access_token(user.id)

    # Signal the frontend to collect company info if recruiter has none yet
    needs_company = (
        "true"
        if account_type == "recruiter" and user.recruiter_ext and not user.recruiter_ext.company
        else "false"
    )
    redirect = _fe(
        f"/auth/linkedin/callback?token={jwt}&account_type={account_type}&needs_company={needs_company}"
    )
    return RedirectResponse(url=redirect)


# ── Recruiter profile update (company / third-party flag) ────────────────────

class _RecruiterProfileUpdate(BaseModel):
    company: str | None = None
    is_third_party: bool | None = None


@router.patch("/profile", tags=["auth"])
def update_linkedin_recruiter_profile(
    body: _RecruiterProfileUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Let a LinkedIn-authenticated recruiter set/update their company name."""
    ext = db.query(models.RecruiterExtension).filter(
        models.RecruiterExtension.user_id == current_user.id
    ).first()

    if not ext:
        raise HTTPException(status_code=403, detail="Recruiter profile required.")

    if body.company is not None:
        ext.company = body.company.strip() or None
    if body.is_third_party is not None:
        ext.is_third_party = body.is_third_party

    db.commit()
    return {
        "id": current_user.id,
        "company": ext.company,
        "is_third_party": ext.is_third_party,
        "linkedin_verified": current_user.linkedin_verified,
    }
