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
from routers.auth import _load_user_full
from services.auth_service import create_access_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth/google", tags=["google-auth"])

_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
_SCOPES = "openid email profile"


def _fe(path: str) -> str:
    return f"{settings.FRONTEND_URL}{path}"


# ── Step 1: Redirect user to Google ──────────────────────────────────────────

@router.get("/authorize")
def google_authorize(
    account_type: str = Query(..., pattern="^(recruiter|candidate)$"),
):
    """
    Kick off the Google OAuth flow.
    account_type tells us which capability extension to create after callback.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured on this server.")

    # Embed account_type in the opaque state so the callback can read it back
    state = f"{account_type}|{secrets.token_urlsafe(16)}"
    params = {
        "response_type": "code",
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "scope": _SCOPES,
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
        "include_granted_scopes": "true",
    }
    return RedirectResponse(url=f"{_AUTHORIZE_URL}?{urlencode(params)}")


# ── Step 2: Handle callback from Google ──────────────────────────────────────

@router.get("/callback")
async def google_callback(
    code: str = Query(default=None),
    state: str = Query(default=None),
    error: str = Query(default=None),
    db: Session = Depends(get_db),
):
    if error:
        logger.warning("Google OAuth error: %s", error)
        return RedirectResponse(url=_fe(f"/auth/google/callback?error={error}"))

    if not code or not state:
        return RedirectResponse(url=_fe("/auth/google/callback?error=missing_params"))

    # Parse account_type from state  (format: "candidate|<nonce>")
    try:
        account_type = state.split("|")[0]
        if account_type not in ("recruiter", "candidate"):
            raise ValueError
    except (IndexError, ValueError):
        return RedirectResponse(url=_fe("/auth/google/callback?error=invalid_state"))

    # Exchange authorisation code for access token
    async with httpx.AsyncClient(timeout=10) as client:
        token_resp = await client.post(
            _TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if token_resp.status_code != 200:
        logger.error("Google token exchange failed: %s", token_resp.text)
        return RedirectResponse(url=_fe("/auth/google/callback?error=token_exchange_failed"))

    access_token = token_resp.json().get("access_token")

    # Fetch the OpenID Connect user profile
    async with httpx.AsyncClient(timeout=10) as client:
        ui_resp = await client.get(
            _USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if ui_resp.status_code != 200:
        logger.error("Google userinfo failed: %s", ui_resp.text)
        return RedirectResponse(url=_fe("/auth/google/callback?error=userinfo_failed"))

    userinfo = ui_resp.json()
    google_id: str = userinfo.get("sub", "")
    email: str = userinfo.get("email", "")
    full_name: str = (
        userinfo.get("name")
        or f"{userinfo.get('given_name', '')} {userinfo.get('family_name', '')}".strip()
        or email
    )
    picture: str = userinfo.get("picture", "")

    if not google_id or not email:
        return RedirectResponse(url=_fe("/auth/google/callback?error=missing_profile_data"))

    # ── Find or create the user (unified identity — no role column) ───────────

    # 1. Returning user — match by google_id
    user = db.query(models.User).filter(models.User.google_id == google_id).first()

    # 2. Existing email/password (or LinkedIn) account — link Google to it
    if not user:
        user = db.query(models.User).filter(models.User.email == email).first()
        if user:
            user.google_id = google_id

    # 3. Brand new user — create the account
    if not user:
        user = models.User(
            email=email,
            hashed_password=None,
            full_name=full_name,
            google_id=google_id,
            avatar_url=picture or None,
            is_active=True,
        )
        db.add(user)
        db.flush()
    else:
        user.google_id = google_id
        # Backfill an avatar from Google if the user doesn't have one yet
        if picture and not user.avatar_url:
            user.avatar_url = picture

    # Ensure the requested capability extension exists
    if account_type == "recruiter":
        if not db.query(models.RecruiterExtension).filter(
            models.RecruiterExtension.user_id == user.id
        ).first():
            db.add(models.RecruiterExtension(user_id=user.id))
    else:
        if not db.query(models.CandidateExtension).filter(
            models.CandidateExtension.user_id == user.id
        ).first():
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
        f"/auth/google/callback?token={jwt}&account_type={account_type}&needs_company={needs_company}"
    )
    return RedirectResponse(url=redirect)
