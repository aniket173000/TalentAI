import hashlib
import logging
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from services.auth_service import create_access_token, decode_token, hash_password, verify_password
from services.email_service import send_signup_otp_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

OTP_EXPIRY_MINUTES = 10
MAX_OTP_ATTEMPTS = 5

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)


# ── Shared dependencies ───────────────────────────────────────────────────────

def _load_user_full(user_id: int, db: Session) -> models.User | None:
    """Load a User with all extension relationships eagerly."""
    return (
        db.query(models.User)
        .options(
            joinedload(models.User.candidate_ext),
            joinedload(models.User.recruiter_ext),
            joinedload(models.User.education_records).joinedload(models.UserEducation.college),
        )
        .filter(models.User.id == user_id)
        .first()
    )


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = _load_user_full(user_id, db)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


async def get_optional_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Optional[models.User]:
    """Returns None instead of raising when token is absent or invalid."""
    if not token:
        return None
    try:
        payload = decode_token(token)
        user = _load_user_full(int(payload["sub"]), db)
        return user if user and user.is_active else None
    except Exception:
        return None


def require_mode(mode: str):
    """
    Factory that returns a FastAPI dependency enforcing a capability extension.
    mode="recruiter" → user must have a RecruiterExtension row.
    mode="candidate" → user must have a CandidateExtension row.
    A user with both extensions satisfies either guard simultaneously.
    """
    async def _dep(user: models.User = Depends(get_current_user)) -> models.User:
        if mode == "recruiter" and not user.is_recruiter:
            raise HTTPException(
                status_code=403,
                detail="Recruiter profile required. Add recruiter access from your account settings.",
            )
        if mode == "candidate" and not user.is_candidate:
            raise HTTPException(
                status_code=403,
                detail="Candidate profile required. Add candidate access from your account settings.",
            )
        return user
    return _dep


# Convenience aliases — imported by all other routers
require_recruiter = require_mode("recruiter")
require_candidate = require_mode("candidate")


# ── Registration (email-OTP verified) ────────────────────────────────────────

class RegisterVerifyRequest(BaseModel):
    email: EmailStr
    otp_code: str


class RegisterResendRequest(BaseModel):
    email: EmailStr


def _assert_role_available(body_email: str, account_type: str, db: Session) -> None:
    """Block same-role re-registration. Cross-role is allowed (dual-mode via signup)."""
    existing = (
        db.query(models.User)
        .options(
            joinedload(models.User.candidate_ext),
            joinedload(models.User.recruiter_ext),
        )
        .filter(models.User.email == body_email)
        .first()
    )
    if existing:
        if account_type == "recruiter" and existing.is_recruiter:
            raise HTTPException(status_code=400, detail="This email already has a recruiter account.")
        if account_type == "candidate" and existing.is_candidate:
            raise HTTPException(status_code=400, detail="This email already has a candidate account.")


def _create_otp() -> tuple[str, str]:
    code = str(secrets.randbelow(900000) + 100000)  # 6-digit
    return code, hashlib.sha256(code.encode()).hexdigest()


@router.post("/register/send-otp")
async def register_send_otp(
    body: schemas.UserCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Step 1 of signup: validate, stash a pending registration, email a 6-digit OTP.
    No `users` row is created yet — the account only materialises after OTP confirm."""
    _assert_role_available(body.email, body.account_type, db)

    code, otp_hash = _create_otp()
    expires_at = datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES)

    # Replace any prior pending registration for this email.
    db.query(models.PendingRegistration).filter(
        models.PendingRegistration.email == body.email
    ).delete(synchronize_session=False)

    db.add(models.PendingRegistration(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        account_type=body.account_type,
        company=body.company.strip() if body.company else None,
        is_third_party=body.is_third_party_recruiter,
        otp_hash=otp_hash,
        attempts=0,
        expires_at=expires_at,
    ))
    db.commit()

    background_tasks.add_task(send_signup_otp_email, body.email, body.full_name, code, OTP_EXPIRY_MINUTES)
    logger.info("Signup OTP issued for %s (%s)", body.email, body.account_type)
    return {"detail": f"Verification code sent to {body.email}.", "expires_in_minutes": OTP_EXPIRY_MINUTES}


@router.post("/register/resend-otp")
async def register_resend_otp(
    body: RegisterResendRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    pending = (
        db.query(models.PendingRegistration)
        .filter(models.PendingRegistration.email == body.email)
        .first()
    )
    if not pending:
        raise HTTPException(status_code=404, detail="No pending signup for this email. Please start again.")

    code, otp_hash = _create_otp()
    pending.otp_hash = otp_hash
    pending.attempts = 0
    pending.expires_at = datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES)
    db.commit()

    background_tasks.add_task(send_signup_otp_email, pending.email, pending.full_name, code, OTP_EXPIRY_MINUTES)
    return {"detail": f"A new code was sent to {body.email}.", "expires_in_minutes": OTP_EXPIRY_MINUTES}


@router.post("/register/verify-otp", response_model=schemas.Token)
def register_verify_otp(body: RegisterVerifyRequest, db: Session = Depends(get_db)):
    """Step 2 of signup: confirm OTP and create the account."""
    pending = (
        db.query(models.PendingRegistration)
        .filter(models.PendingRegistration.email == body.email)
        .order_by(models.PendingRegistration.created_at.desc())
        .first()
    )
    if not pending:
        raise HTTPException(status_code=400, detail="No pending signup for this email. Please start again.")
    if datetime.utcnow() > pending.expires_at:
        db.delete(pending)
        db.commit()
        raise HTTPException(status_code=400, detail="Your code has expired. Please request a new one.")
    if (pending.attempts or 0) >= MAX_OTP_ATTEMPTS:
        db.delete(pending)
        db.commit()
        raise HTTPException(status_code=400, detail="Too many incorrect attempts. Please request a new code.")

    if hashlib.sha256(body.otp_code.strip().encode()).hexdigest() != pending.otp_hash:
        pending.attempts = (pending.attempts or 0) + 1
        db.commit()
        remaining = MAX_OTP_ATTEMPTS - pending.attempts
        raise HTTPException(status_code=400, detail=f"Incorrect code. {max(remaining, 0)} attempt(s) left.")

    # OTP valid — create the account (or add the cross-role capability).
    existing = (
        db.query(models.User)
        .options(joinedload(models.User.candidate_ext), joinedload(models.User.recruiter_ext))
        .filter(models.User.email == pending.email)
        .first()
    )
    if existing:
        # Guard again in case a competing signup happened between send and verify.
        if pending.account_type == "recruiter" and existing.is_recruiter:
            raise HTTPException(status_code=400, detail="This email already has a recruiter account.")
        if pending.account_type == "candidate" and existing.is_candidate:
            raise HTTPException(status_code=400, detail="This email already has a candidate account.")
        user = existing
        user.email_verified = True
    else:
        user = models.User(
            email=pending.email,
            hashed_password=pending.hashed_password,
            full_name=pending.full_name,
            email_verified=True,
        )
        db.add(user)
        db.flush()

    if pending.account_type == "recruiter":
        db.add(models.RecruiterExtension(
            user_id=user.id,
            company=pending.company,
            is_third_party=bool(pending.is_third_party),
        ))
    else:
        db.add(models.CandidateExtension(user_id=user.id))

    db.delete(pending)
    db.commit()
    user = _load_user_full(user.id, db)
    logger.info("Verified %s account created for: %s", pending.account_type, user.email)
    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
        "user": schemas.UserResponse.from_user(user),
    }


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=schemas.Token)
def login(body: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = (
        db.query(models.User)
        .filter(models.User.email == body.email)
        .first()
    )
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    user = _load_user_full(user.id, db)
    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
        "user": schemas.UserResponse.from_user(user),
    }


@router.post("/token")
def token_form(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """OAuth2 password grant — powers the Swagger UI Authorize button."""
    user = db.query(models.User).filter(models.User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
    }


@router.get("/me", response_model=schemas.UserResponse)
def me(user: models.User = Depends(get_current_user)):
    return schemas.UserResponse.from_user(user)


# ── Add capability to existing account ───────────────────────────────────────

@router.post("/add-capability")
def add_capability(
    account_type: str,
    company: Optional[str] = None,
    is_third_party: bool = False,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Let an existing user add recruiter or candidate capability to their account.
    This is what enables the dual-mode use case (hiring + being hired).
    """
    if account_type not in ("recruiter", "candidate"):
        raise HTTPException(status_code=422, detail="account_type must be 'recruiter' or 'candidate'")

    if account_type == "recruiter":
        if current_user.is_recruiter:
            raise HTTPException(status_code=400, detail="Already have recruiter access.")
        db.add(models.RecruiterExtension(
            user_id=current_user.id,
            company=company.strip() if company else None,
            is_third_party=is_third_party,
        ))
    else:
        if current_user.is_candidate:
            raise HTTPException(status_code=400, detail="Already have candidate access.")
        db.add(models.CandidateExtension(user_id=current_user.id))

    db.commit()
    user = _load_user_full(current_user.id, db)
    return schemas.UserResponse.from_user(user)
