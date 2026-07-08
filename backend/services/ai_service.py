"""
Thin compatibility wrapper — all logic lives in services/ai/.
Delegates every call to the configured AIStrategy (Strategy pattern).
Switch providers via AI_PROVIDER in .env without touching callers.
"""
import json
import logging

from services.ai.factory import get_ai_strategy

logger = logging.getLogger(__name__)


async def generate_college_info(college_name: str, url: str | None = None) -> dict:
    """
    Use AI to generate structured metadata for a college / university.

    Returns a dict with:
      short_name       str        e.g. "IITB", "BITS", "MIT" (max 8 chars)
      description      str        2-3 sentence recruiter-facing blurb
      location         str        "City, Country"
      founded_year     int|None
      highlights       list[str]  3-4 things that make graduates stand out
      talent_strengths list[str]  2-3 technical / professional strengths
      official_website str|None   the institution's primary website domain
    """
    from config import settings

    url_hint = f"\nWebsite/LinkedIn: {url}" if url else ""
    prompt = (
        f"Given this college, return a JSON object with these exact keys:\n"
        f"- short_name: the most widely recognized abbreviation (e.g. 'IITB' for 'IIT Bombay', "
        f"'BITS' for 'BITS Pilani', 'MIT' for 'Massachusetts Institute of Technology'). Max 8 chars.\n"
        f"- description: 2-3 sentences for recruiters, focusing on academic reputation and graduate quality.\n"
        f"- location: 'City, Country' format.\n"
        f"- founded_year: integer or null.\n"
        f"- highlights: array of 3-4 bullet points about what makes graduates stand out to recruiters.\n"
        f"- talent_strengths: array of 2-3 core technical or professional strengths of graduates.\n"
        f"- official_website: the institution's primary official website URL (e.g. 'https://www.iitb.ac.in'), "
        f"or null if you are not confident. Used to fetch the official logo.\n\n"
        f"College: {college_name}{url_hint}\n\n"
        f"Respond with valid JSON only."
    )

    try:
        p = settings.AI_PROVIDER.lower()
        if p == "openai":
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            resp = await client.chat.completions.create(
                model=settings.AI_MODEL_MINI,
                reasoning_effort="low",
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": "You are a college information expert. Return valid JSON only."},
                    {"role": "user", "content": prompt},
                ],
            )
            return json.loads(resp.choices[0].message.content)

        elif p == "claude":
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            resp = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=600,
                messages=[{"role": "user", "content": prompt}],
            )
            text = resp.content[0].text.strip()
            # Strip markdown fences if present
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            return json.loads(text)

    except Exception as exc:
        logger.warning("College AI info generation failed for %r: %s", college_name, exc)

    # Fallback: derive short name from initials only
    words = college_name.split()
    short = "".join(w[0].upper() for w in words if w[0].isalpha())[:6]
    return {
        "short_name": short or college_name[:6].upper(),
        "description": f"{college_name} is a higher education institution.",
        "location": None,
        "founded_year": None,
        "highlights": [],
        "talent_strengths": [],
        "official_website": None,
    }


async def screen_resume(jd_text: str, resume_text: str, job_title: str) -> dict:
    return await get_ai_strategy().screen_resume(jd_text, resume_text, job_title)


async def generate_rejection_email(
    candidate_name: str,
    job_title: str,
    company: str,
    match_score: float,
    gaps: list,
    improvement_suggestions: list,
    reason: str = "score_below_threshold",
    recruiter_name: str = "Recruitment Team",
    recruiter_email: str = "",
    recruiter_position: str = "Recruiter",
) -> str:
    return await get_ai_strategy().generate_rejection_email(
        candidate_name, job_title, company,
        match_score, gaps, improvement_suggestions, reason,
        recruiter_name, recruiter_email, recruiter_position,
    )


async def rank_tied_candidates(
    jd_text: str,
    job_title: str,
    candidates: list,
) -> list:
    return await get_ai_strategy().rank_tied_candidates(jd_text, job_title, candidates)


async def generate_rank_explanation(
    candidate_name: str,
    job_title: str,
    rank: int,
    total: int,
    resume_text: str,
    above_candidates: list,
    jd_text: str,
) -> str:
    return await get_ai_strategy().generate_rank_explanation(
        candidate_name, job_title, rank, total, resume_text, above_candidates, jd_text
    )


async def get_embedding(text: str) -> list[float]:
    return await get_ai_strategy().get_embedding(text)


async def generate_career_profile(resume_text: str) -> dict:
    return await get_ai_strategy().generate_career_profile(resume_text)


async def parse_jd_requirements(jd_text: str, job_title: str) -> dict:
    return await get_ai_strategy().parse_jd_requirements(jd_text, job_title)


async def extract_structured_profile(resume_text: str) -> dict:
    return await get_ai_strategy().extract_structured_profile(resume_text)


async def verify_skill_claims(skills: list[str], resume_text: str) -> dict:
    return await get_ai_strategy().verify_skill_claims(skills, resume_text)


async def generate_readiness_roadmap(
    jd_text: str,
    resume_text: str,
    job_title: str,
    current_score: float,
    gaps: list,
    improvement_suggestions: list,
    fresher_mode: bool = False,
) -> dict:
    return await get_ai_strategy().generate_readiness_roadmap(
        jd_text, resume_text, job_title, current_score, gaps, improvement_suggestions, fresher_mode
    )


async def generate_displacement_comparison(
    rank1_resume: str,
    rank1_score: float,
    displaced_resume: str,
    displaced_score: float,
    jd_text: str,
    job_title: str,
) -> dict:
    return await get_ai_strategy().generate_displacement_comparison(
        rank1_resume, rank1_score, displaced_resume, displaced_score, jd_text, job_title
    )
