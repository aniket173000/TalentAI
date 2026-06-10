import json
import logging
from functools import lru_cache

from openai import AsyncOpenAI

from config import settings
from services.ai.base import AIStrategy

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _client() -> AsyncOpenAI:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Add it to backend/.env and restart."
        )
    return AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


class OpenAIStrategy(AIStrategy):
    """AI provider backed by OpenAI GPT-4o + text-embedding-3-small."""

    async def screen_resume(
        self, jd_text: str, resume_text: str, job_title: str
    ) -> dict:
        system = (
            "You are a senior talent analyst with 15+ years of recruiting experience. "
            "Evaluate resumes with deep project analysis and zero bias. "
            "For every project in the resume, score its direct relevance to the JD. "
            "Always respond with valid JSON only."
        )
        user = f"""Analyse this resume against the job description.

JOB TITLE: {job_title}

JOB DESCRIPTION:
{jd_text[:3500]}

CANDIDATE RESUME:
{resume_text[:3500]}

Return ONLY this JSON (no markdown):
{{
    "match_score": <composite 0-100: 40% skills, 35% project relevance, 25% experience>,
    "project_scores": [
        {{
            "project_name": "<name as written in resume>",
            "relevance_score": <0-100>,
            "tech_overlap": ["tech1", "tech2"],
            "notes": "<one-line relevance note>"
        }}
    ],
    "strengths": ["strength 1", "strength 2", "strength 3"],
    "gaps": ["gap 1", "gap 2"],
    "improvement_suggestions": ["tip 1", "tip 2", "tip 3"],
    "summary": "2-3 sentence overall assessment"
}}

Scoring guide:
- 90-100: Exceptional — exceeds most requirements, strong project alignment
- 80-89: Strong — meets core requirements, relevant projects
- 70-79: Partial — meets some requirements, moderate project overlap
- Below 70: Weak — significant skill or project gaps

Be rigorous. Award 80+ only for genuinely qualified candidates."""

        response = await _client().chat.completions.create(
            model=settings.AI_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        return json.loads(response.choices[0].message.content)

    async def generate_rejection_email(
        self,
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
        situation_map = {
            "score_below_threshold": "the applicant's profile did not meet the minimum match threshold for this role",
            "pool_full": "the applicant pool is currently full with higher-matching candidates",
            "displaced": "a stronger candidate entered the pool, displacing the applicant's position",
        }
        situation = situation_map.get(reason, situation_map["score_below_threshold"])

        signature_lines = [recruiter_name]
        if recruiter_email:
            signature_lines.append(recruiter_email)
        signature_lines.append(recruiter_position)
        signature_lines.append("TalentAI Recruitment Team")
        signature = "\n".join(signature_lines)

        prompt = f"""Write a professional, empathetic rejection email for a job applicant.

Context:
- Candidate: {candidate_name}
- Role: {job_title} at {company}
- AI Match Score: {match_score:.1f}%
- Situation: {situation}
- Profile gaps: {', '.join(gaps[:3]) if gaps else 'General qualification gaps'}
- Suggested improvements: {', '.join(improvement_suggestions[:3]) if improvement_suggestions else 'Resume optimisation'}

Requirements:
1. Open with a genuine thank-you for applying
2. Deliver the news clearly but compassionately (no vague corporate speak)
3. Reference 2-3 specific, actionable improvement tips from the suggestions above
4. Encourage them to strengthen their profile and consider future openings
5. Close on an uplifting, forward-looking note
6. Maximum 250 words, professional yet human tone
7. End with exactly this sign-off (no changes):

Best regards,
{signature}

Start directly with: Dear {candidate_name},"""

        response = await _client().chat.completions.create(
            model=settings.AI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=400,
        )
        return response.choices[0].message.content

    async def get_embedding(self, text: str) -> list[float]:
        response = await _client().embeddings.create(
            model=settings.EMBEDDING_MODEL,
            input=text[:8000],
        )
        return response.data[0].embedding
