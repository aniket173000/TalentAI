"""
Thin compatibility wrapper — all logic lives in services/ai/.
Delegates every call to the configured AIStrategy (Strategy pattern).
Switch providers via AI_PROVIDER in .env without touching callers.
"""
from services.ai.factory import get_ai_strategy


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


async def get_embedding(text: str) -> list[float]:
    return await get_ai_strategy().get_embedding(text)
