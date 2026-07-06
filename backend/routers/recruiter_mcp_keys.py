"""
Recruiter MCP API key issuance/revocation.

JWT-authenticated (via require_recruiter) — deliberately NOT the same auth mechanism
as the MCP tool calls themselves, which use the long-lived key this endpoint issues.
Don't conflate the two: a recruiter's JWT session token gets them access to THIS
endpoint; the key it returns is what they put in `claude mcp add` to reach
/mcp-recruiter afterward.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from config import settings
from database import get_db
from routers.auth import require_recruiter
from services.mcp_bridge import issue_recruiter_key, revoke_recruiter_key

router = APIRouter(prefix="/api/recruiter/mcp-keys", tags=["recruiter-mcp-keys"])


@router.post("", response_model=schemas.RecruiterMcpKeyIssueResponse, status_code=201)
def create_key(
    db: Session = Depends(get_db),
    recruiter: models.User = Depends(require_recruiter),
):
    key = issue_recruiter_key(db, recruiter)
    # Trailing slash required — see the matching comment in routers/assignments.py:
    # a bare mount path 307-redirects to the trailing-slash form, and that redirect's
    # Location header comes back as http:// (not https://) behind this reverse proxy,
    # breaking real MCP clients. Hitting the exact path avoids the redirect entirely.
    connect_command = (
        f'claude mcp add --transport http nideknil-recruiter {settings.MCP_PUBLIC_URL}/mcp-recruiter/ '
        f'--header "Authorization: Bearer {key.key}"'
    )
    return schemas.RecruiterMcpKeyIssueResponse(
        id=key.id,
        key=key.key,               # shown ONCE — not retrievable again after this response
        connect_command=connect_command,
        created_at=key.created_at,
    )


@router.get("", response_model=list[schemas.RecruiterMcpKeyResponse])
def list_keys(
    db: Session = Depends(get_db),
    recruiter: models.User = Depends(require_recruiter),
):
    keys = (
        db.query(models.RecruiterMcpApiKey)
        .filter(
            models.RecruiterMcpApiKey.recruiter_id == recruiter.id,
            # Legacy soft-revoked rows (if any) are hidden — revoke now hard-deletes.
            models.RecruiterMcpApiKey.revoked_at.is_(None),
        )
        .order_by(models.RecruiterMcpApiKey.created_at.desc())
        .all()
    )
    return [schemas.RecruiterMcpKeyResponse.model_validate(k) for k in keys]


@router.delete("/{key_id}", status_code=204)
def delete_key(
    key_id: int,
    db: Session = Depends(get_db),
    recruiter: models.User = Depends(require_recruiter),
):
    # Hard delete — the key is removed from the DB entirely, not just flagged.
    if not revoke_recruiter_key(db, key_id, recruiter):
        raise HTTPException(status_code=404, detail="Key not found")
    return None
