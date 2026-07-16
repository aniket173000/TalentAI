"""
Admin outreach agent — paste a hiring post, get a drafted Nideknil pitch, review,
then send it from talent@nideknil.in.

  POST /api/outreach/draft    {source_text}                 → extracted fields + draft
  POST /api/outreach/send     {target_email, subject, body} → sends + logs
  GET  /api/outreach/history                                → recent drafts/sends

Admin-only (same email allowlist as /admin). Sending is a separate, explicit call
so nothing goes out without a human clicking approve.
"""
import json
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from database import get_db
from routers.admin import require_admin
from services.email_service import send_email
from services.outreach_agent import (
    OutreachError,
    analyze_and_draft,
    build_email_html,
    signature_text,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/outreach", tags=["outreach"])


class DraftRequest(BaseModel):
    source_text: str


class SendRequest(BaseModel):
    target_email: str
    subject: str
    body: str
    company: Optional[str] = None
    contact_name: Optional[str] = None
    roles: Optional[List[str]] = None
    source_text: Optional[str] = None


@router.post("/draft")
async def draft(
    body: DraftRequest,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        result = await analyze_and_draft(body.source_text)
    except OutreachError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.error("Outreach draft failed: %s", exc)
        raise HTTPException(status_code=502, detail="Draft failed — check the LLM key/logs.")

    # Warn (don't block) if we've already pitched this contact.
    already = None
    if result.get("hiring_email"):
        already = (
            db.query(models.OutreachEmail)
            .filter(
                models.OutreachEmail.target_email == result["hiring_email"],
                models.OutreachEmail.status == "sent",
            )
            .order_by(models.OutreachEmail.sent_at.desc())
            .first()
        )
    result["already_contacted_at"] = already.sent_at.isoformat() if already else None
    return result


@router.post("/send")
async def send(
    body: SendRequest,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = (body.target_email or "").strip()
    if "@" not in target:
        raise HTTPException(status_code=422, detail="A valid recipient email is required.")
    if not body.subject.strip() or not body.body.strip():
        raise HTTPException(status_code=422, detail="Subject and body cannot be empty.")

    # Append the branded signature (the drafted body ends on the CTA). Plain-text
    # gets the text signature; HTML clients get the styled version.
    prose = body.body.strip()
    plain_body = f"{prose}\n\n{signature_text()}"
    html_body = build_email_html(prose)

    log = models.OutreachEmail(
        target_email=target,
        company=body.company,
        contact_name=body.contact_name,
        roles=json.dumps(body.roles or []),
        subject=body.subject.strip(),
        body=plain_body,
        source_text=(body.source_text or "")[:8000] or None,
        status="draft",
        created_by=admin.id,
    )
    db.add(log)
    db.flush()

    try:
        await send_email(target, body.subject.strip(), plain_body, html_body=html_body)
        log.status = "sent"
        log.sent_at = datetime.utcnow()
        db.commit()
    except Exception as exc:  # noqa: BLE001
        log.status = "failed"
        log.error = str(exc)[:1000]
        db.commit()
        logger.error("Outreach send to %s failed: %s", target, exc)
        raise HTTPException(status_code=502, detail=f"Send failed: {exc}")

    return {"status": "sent", "id": log.id, "sent_at": log.sent_at.isoformat()}


@router.get("/history")
def history(
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(models.OutreachEmail)
        .order_by(models.OutreachEmail.created_at.desc())
        .limit(50)
        .all()
    )
    return {
        "items": [
            {
                "id": r.id,
                "target_email": r.target_email,
                "company": r.company,
                "roles": json.loads(r.roles) if r.roles else [],
                "subject": r.subject,
                "status": r.status,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "sent_at": r.sent_at.isoformat() if r.sent_at else None,
            }
            for r in rows
        ]
    }
