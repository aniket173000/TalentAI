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

    async def parse_jd_requirements(self, jd_text, job_title):
        raise NotImplementedError(self._MSG)

    async def generate_displacement_comparison(
        self, rank1_resume, rank1_score, displaced_resume, displaced_score, jd_text, job_title
    ):
        raise NotImplementedError(self._MSG)

    async def verify_skill_claims(self, skills, resume_text):
        raise NotImplementedError(self._MSG)

    async def generate_readiness_roadmap(
        self, jd_text, resume_text, job_title, current_score, gaps, improvement_suggestions, fresher_mode=False
    ):
        raise NotImplementedError(self._MSG)

    async def extract_structured_profile(self, resume_text):
        raise NotImplementedError(self._MSG)

    async def answer_question(self, context, question):
        raise NotImplementedError(self._MSG)
