import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from services.auth_service import create_access_token, decode_token, hash_password, verify_password

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

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


# ── Registration ──────────────────────────────────────────────────────────────

@router.post("/register", response_model=schemas.Token)
def register(body: schemas.UserCreate, db: Session = Depends(get_db)):
    existing = (
        db.query(models.User)
        .options(
            joinedload(models.User.candidate_ext),
            joinedload(models.User.recruiter_ext),
        )
        .filter(models.User.email == body.email)
        .first()
    )

    if existing:
        # Block same-role re-registration; cross-role adds a second capability (dual-mode via signup)
        if body.account_type == "recruiter" and existing.is_recruiter:
            raise HTTPException(status_code=400, detail="This email already has a recruiter account.")
        if body.account_type == "candidate" and existing.is_candidate:
            raise HTTPException(status_code=400, detail="This email already has a candidate account.")
        user = existing
    else:
        user = models.User(
            email=body.email,
            hashed_password=hash_password(body.password),
            full_name=body.full_name,
        )
        db.add(user)
        db.flush()  # get user.id without committing

    # Create the requested capability extension
    if body.account_type == "recruiter":
        db.add(models.RecruiterExtension(
            user_id=user.id,
            company=body.company.strip() if body.company else None,
            is_third_party=body.is_third_party_recruiter,
        ))
    else:
        db.add(models.CandidateExtension(user_id=user.id))

    db.commit()
    user = _load_user_full(user.id, db)
    logger.info("New %s account for: %s", body.account_type, user.email)
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
