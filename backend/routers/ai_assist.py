"""
AI authoring assistance for the job- and referral-creation forms.

  POST /api/ai/job-description  → streams a generated JD (text/plain) in real time
  POST /api/ai/job-details      → returns inferred Department/Employment Type/
                                  Remote Policy/Location as JSON

Any authenticated user may call these (recruiters use them on the job form,
candidates on the referral form). Generation reuses the existing OpenAI client.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import models
from routers.auth import get_current_user
from services.jd_generator import stream_job_description, suggest_job_details

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["ai"])


class JDGenerateRequest(BaseModel):
    title: str
    company: str | None = None
    employment_type: str | None = None
    location: str | None = None
    context: str | None = None


class JDDetailsRequest(BaseModel):
    title: str
    company: str | None = None
    jd_text: str | None = None


@router.post("/job-description")
async def generate_job_description(
    body: JDGenerateRequest,
    current_user: models.User = Depends(get_current_user),
):
    """Stream a full job description written from the title (+ optional context)."""
    if not body.title or not body.title.strip():
        raise HTTPException(status_code=422, detail="A job title is required to generate a description.")

    async def _gen():
        try:
            async for chunk in stream_job_description(
                title=body.title,
                company=body.company,
                employment_type=body.employment_type,
                location=body.location,
                context=body.context,
            ):
                yield chunk
        except Exception as exc:  # surface a readable line into the stream
            logger.exception("JD generation failed")
            yield f"\n\n[AI generation failed: {exc}]"

    # text/plain streaming — the frontend reads it with fetch() + a ReadableStream.
    return StreamingResponse(
        _gen(),
        media_type="text/plain; charset=utf-8",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


@router.post("/job-details")
async def infer_job_details(
    body: JDDetailsRequest,
    current_user: models.User = Depends(get_current_user),
):
    """Infer Department / Employment Type / Remote Policy / Location for the form."""
    if not body.title or not body.title.strip():
        raise HTTPException(status_code=422, detail="A job title is required.")
    return await suggest_job_details(
        title=body.title, company=body.company, jd_text=body.jd_text,
    )
