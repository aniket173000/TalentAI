from services.ai.base import AIStrategy


class ClaudeStrategy(AIStrategy):
    """
    Stub for Anthropic Claude integration.
    Set AI_PROVIDER=claude in .env once implemented.
    """

    _MSG = (
        "ClaudeStrategy is not yet implemented. "
        "Set AI_PROVIDER=openai in .env to use the OpenAI backend."
    )

    async def screen_resume(self, jd_text, resume_text, job_title):
        raise NotImplementedError(self._MSG)

    async def generate_rejection_email(
        self, candidate_name, job_title, company,
        match_score, gaps, improvement_suggestions,
        reason="score_below_threshold",
        recruiter_name="Recruitment Team",
        recruiter_email="",
        recruiter_position="Recruiter",
    ):
        raise NotImplementedError(self._MSG)

    async def rank_tied_candidates(self, jd_text, job_title, candidates):
        raise NotImplementedError(self._MSG)

    async def generate_rank_explanation(
        self, candidate_name, job_title, rank, total, resume_text, above_candidates, jd_text
    ):
        raise NotImplementedError(self._MSG)

    async def get_embedding(self, text):
        raise NotImplementedError(self._MSG)

    async def generate_career_profile(self, resume_text):
        raise NotImplementedError(self._MSG)
