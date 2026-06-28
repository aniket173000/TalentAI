"""
User-submitted product feedback.

  POST   /api/product-feedback         Submit feedback (any user, anonymous OK)
  GET    /api/product-feedback/list    Admin list (recruiter-only for now)
"""
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from config import settings
from database import get_db
from routers.auth import get_optional_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/product-feedback", tags=["product-feedback"])

VALID_MOODS = {"love", "happy", "neutral", "frustrated", "bug"}


class FeedbackSubmit(BaseModel):
    text: str
    mood: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None


async def _categorise(text: str, mood: Optional[str]) -> dict:
    prompt = (
        "You are a product analyst for Nideknil, an AI-powered job recruitment platform.\n"
        "A user submitted the following feedback"
        + (f" (their mood: {mood})" if mood else "")
        + f":\n\n\"\"\"\n{text[:3000]}\n\"\"\"\n\n"
        "Classify and summarise the feedback. Return ONLY valid JSON with these exact keys:\n"
        '  "category":      one of bug|feature_request|ui_ux|performance|praise|question|security|other\n'
        '  "summary":       a single sentence (max 100 chars) capturing the core point\n'
        '  "priority":      low|medium|high  (bugs and security are always at least medium)\n'
        '  "sentiment":     positive|neutral|negative\n'
        '  "affected_area": one of onboarding|job_search|application|profile|colleges|referrals|recruiter|general\n'
        "No markdown, no extra keys, no explanation — raw JSON only."
    )
    try:
        if settings.AI_PROVIDER == "claude" and settings.ANTHROPIC_API_KEY:
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            resp = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = resp.content[0].text.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            return json.loads(raw)
        else:
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            resp = await client.chat.completions.create(
                model="gpt-4o-mini",
                temperature=0,
                response_format={"type": "json_object"},
                messages=[{"role": "user", "content": prompt}],
            )
            return json.loads(resp.choices[0].message.content)
    except Exception as exc:
        logger.warning("Feedback categorisation failed: %s", exc)
        return {
            "category": "other",
            "summary": text[:100],
            "priority": "low",
            "sentiment": "neutral",
            "affected_area": "general",
        }


@router.post("")
async def submit_feedback(
    body: FeedbackSubmit,
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_optional_user),
):
    if not body.text or len(body.text.strip()) < 10:
        raise HTTPException(status_code=400, detail="Feedback must be at least 10 characters.")
    if body.mood and body.mood not in VALID_MOODS:
        raise HTTPException(status_code=400, detail=f"Invalid mood. Allowed: {', '.join(VALID_MOODS)}")

    analysis = await _categorise(body.text.strip(), body.mood)

    row = models.ProductFeedback(
        user_id=current_user.id if current_user else None,
        name=(body.name or (current_user.full_name if current_user else None)),
        email=(body.email or (current_user.email if current_user else None)),
        mood=body.mood,
        raw_text=body.text.strip(),
        category=analysis.get("category", "other"),
        summary=analysis.get("summary", ""),
        priority=analysis.get("priority", "low"),
        sentiment=analysis.get("sentiment", "neutral"),
        affected_area=analysis.get("affected_area", "general"),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "id": row.id,
        "category": row.category,
        "summary": row.summary,
        "priority": row.priority,
        "sentiment": row.sentiment,
        "affected_area": row.affected_area,
    }


@router.get("/list")
def list_feedback(
    db: Session = Depends(get_db),
):
    rows = (
        db.query(models.ProductFeedback)
        .order_by(models.ProductFeedback.created_at.desc())
        .limit(200)
        .all()
    )
    return [
        {
            "id": r.id,
            "name": r.name,
            "email": r.email,
            "mood": r.mood,
            "category": r.category,
            "summary": r.summary,
            "priority": r.priority,
            "sentiment": r.sentiment,
            "affected_area": r.affected_area,
            "raw_text": r.raw_text,
            "created_at": r.created_at,
        }
        for r in rows
    ]
