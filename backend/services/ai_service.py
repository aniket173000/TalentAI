import json
import logging
from functools import lru_cache
from openai import AsyncOpenAI
from config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_client() -> AsyncOpenAI:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Add it to backend/.env and restart the server."
        )
    return AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


async def screen_resume(jd_text: str, resume_text: str, job_title: str) -> dict:
    """
    Use GPT-4o to semantically score a resume against a job description.
    Returns match_score (0-100), strengths, gaps, improvement_suggestions, summary.
    """
    system = (
        "You are a senior talent analyst with 15+ years of recruiting experience. "
        "Evaluate resumes against job descriptions with precision and zero bias. "
        "Always respond with valid JSON only."
    )

    user = f"""Analyze the resume against the job description below.

JOB TITLE: {job_title}

JOB DESCRIPTION:
{jd_text[:3500]}

CANDIDATE RESUME:
{resume_text[:3500]}

Return ONLY this JSON structure (no markdown, no extra text):
{{
    "match_score": <number 0-100>,
    "strengths": ["specific strength 1", "specific strength 2", "specific strength 3"],
    "gaps": ["specific gap 1", "specific gap 2"],
    "improvement_suggestions": ["actionable tip 1", "actionable tip 2", "actionable tip 3"],
    "summary": "2-3 sentence overall assessment"
}}

Scoring guide:
- 90-100: Exceptional match, exceeds most requirements
- 80-89: Strong match, meets core requirements solidly
- 70-79: Partial match, meets some but not all key requirements
- Below 70: Weak match, significant skill or experience gaps

Be rigorous. Award 80+ only for genuinely qualified candidates who meet the core requirements."""

    response = await _get_client().chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
    )

    return json.loads(response.choices[0].message.content)


async def generate_rejection_email(
    candidate_name: str,
    job_title: str,
    company: str,
    match_score: float,
    gaps: list,
    improvement_suggestions: list,
    reason: str = "score_below_threshold",
) -> str:
    """Generate a warm, personalised rejection email with improvement guidance."""

    situation_map = {
        "score_below_threshold": "the applicant's profile did not meet the minimum match threshold for this role",
        "pool_full": "the applicant pool is currently full with higher-matching candidates",
        "displaced": "a stronger candidate entered the pool, displacing the applicant's position",
    }
    situation = situation_map.get(reason, situation_map["score_below_threshold"])

    prompt = f"""Write a professional, empathetic rejection email for a job applicant.

Context:
- Candidate: {candidate_name}
- Role: {job_title} at {company}
- AI Match Score: {match_score:.1f}%
- Situation: {situation}
- Profile gaps identified: {', '.join(gaps[:3]) if gaps else 'General qualification gaps'}
- Suggested improvements: {', '.join(improvement_suggestions[:3]) if improvement_suggestions else 'Resume optimisation'}

Requirements:
1. Open with a genuine thank-you for applying
2. Deliver the news clearly but compassionately (no vague corporate speak)
3. Reference 2-3 specific, actionable improvement tips drawn from the suggestions above
4. Encourage them to strengthen their profile and consider future openings
5. Close on an uplifting, forward-looking note
6. Maximum 250 words, professional yet human tone

Start directly with: Dear {candidate_name},"""

    response = await _get_client().chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
        max_tokens=400,
    )

    return response.choices[0].message.content
