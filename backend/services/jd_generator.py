"""
AI job-description authoring helpers (OpenAI-backed).

Two capabilities used by the "Write with AI" experience on the job- and
referral-creation forms:

  • stream_job_description() — streams a full, well-structured JD token-by-token
    so the recruiter sees it written in real time into an editable box.
  • suggest_job_details()   — infers Department / Employment Type / Remote Policy
    / Location from the title (and company/JD) so the form can pre-fill them.
    The recruiter can still edit every value afterwards.

Both reuse the existing OpenAI client + model (settings.AI_MODEL) — no new
provider dependency.
"""
from __future__ import annotations

import json
import logging
from typing import AsyncIterator

from config import settings
from services.ai.openai_strategy import _client

logger = logging.getLogger(__name__)

EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Internship"]
REMOTE_POLICIES = ["On-site", "Remote", "Hybrid"]

_JD_SYSTEM = (
    "You are an expert technical recruiter and copywriter. You write clear, "
    "modern, inclusive job descriptions that candidates actually want to read. "
    "Return ONLY the job description body in clean Markdown — no preamble, no "
    "code fences, no closing commentary. Use short sections with headings such "
    "as About the Role, What You'll Do, What We're Looking For, Nice to Have, "
    "and (only if it fits) About the Team. Keep it concise and specific; avoid "
    "clichés and buzzword soup. Do not invent salary, benefits, or a deadline."
)


def _jd_user_prompt(title: str, company: str | None,
                    employment_type: str | None, location: str | None,
                    context: str | None) -> str:
    lines = [f"Write a job description for the role: {title.strip()}."]
    if company and company.strip() and company.strip().lower() != "our company":
        lines.append(f"Company: {company.strip()}.")
    if employment_type:
        lines.append(f"Employment type: {employment_type}.")
    if location:
        lines.append(f"Location: {location}.")
    if context and context.strip():
        lines.append(f"Extra context / must-haves from the recruiter: {context.strip()}")
    lines.append("Target length: 250–450 words.")
    return "\n".join(lines)


async def stream_job_description(
    *,
    title: str,
    company: str | None = None,
    employment_type: str | None = None,
    location: str | None = None,
    context: str | None = None,
) -> AsyncIterator[str]:
    """Yield the generated JD in text chunks as the model produces them."""
    client = _client()
    stream = await client.chat.completions.create(
        model=settings.AI_MODEL,
        temperature=0.6,
        stream=True,
        messages=[
            {"role": "system", "content": _JD_SYSTEM},
            {"role": "user", "content": _jd_user_prompt(
                title, company, employment_type, location, context)},
        ],
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:
            yield delta


def _coerce(value: str | None, allowed: list[str]) -> str | None:
    """Snap a model-suggested value onto the allowed enum (case-insensitive)."""
    if not value:
        return None
    v = value.strip().lower()
    for opt in allowed:
        if opt.lower() == v:
            return opt
    return None


async def suggest_job_details(
    *,
    title: str,
    company: str | None = None,
    jd_text: str | None = None,
) -> dict:
    """
    Infer sensible defaults for Department, Employment Type, Remote Policy and
    Location. Returns a dict with those four keys (values may be None/"" when
    the model can't tell). Enum fields are snapped to the form's allowed values.
    """
    client = _client()
    system = (
        "You infer structured metadata for a job posting. Respond with a JSON "
        "object with EXACTLY these keys: department (string, e.g. 'Engineering'), "
        f"employment_type (one of {EMPLOYMENT_TYPES}), "
        f"remote_policy (one of {REMOTE_POLICIES}), "
        "location (string city/region, or 'Remote' if fully remote). "
        "Base it on the role and any description provided. Use an empty string "
        "for anything you genuinely cannot determine."
    )
    user = f"Job title: {title.strip()}"
    if company and company.strip():
        user += f"\nCompany: {company.strip()}"
    if jd_text and jd_text.strip():
        user += f"\nJob description:\n{jd_text.strip()[:4000]}"

    try:
        resp = await client.chat.completions.create(
            model=settings.AI_MODEL,
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        data = json.loads(resp.choices[0].message.content or "{}")
    except Exception as exc:
        logger.warning("suggest_job_details failed (title=%s): %s", title, exc)
        data = {}

    return {
        "department": (data.get("department") or "").strip(),
        "employment_type": _coerce(data.get("employment_type"), EMPLOYMENT_TYPES) or "",
        "remote_policy": _coerce(data.get("remote_policy"), REMOTE_POLICIES) or "",
        "location": (data.get("location") or "").strip(),
    }
