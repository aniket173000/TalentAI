from abc import ABC, abstractmethod


class AIStrategy(ABC):
    """Contract every AI provider must satisfy.

    To add a new provider:
      1. Subclass AIStrategy and implement all three methods.
      2. Register it in factory.py.
      3. Set AI_PROVIDER=<name> in .env.
    """

    @abstractmethod
    async def screen_resume(
        self,
        jd_text: str,
        resume_text: str,
        job_title: str,
    ) -> dict:
        """
        Return a dict with keys:
          match_score (float 0-100), project_scores (list), strengths (list),
          gaps (list), improvement_suggestions (list), summary (str).
        """

    @abstractmethod
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
        """Return the plain-text body of a personalised rejection email."""

    @abstractmethod
    async def rank_tied_candidates(
        self,
        jd_text: str,
        job_title: str,
        candidates: list,
    ) -> list:
        """Given a list of (id, name, resume_text) tuples with equal match scores,
        return their IDs ordered best to worst."""

    @abstractmethod
    async def generate_rank_explanation(
        self,
        candidate_name: str,
        job_title: str,
        rank: int,
        total: int,
        resume_text: str,
        above_candidates: list,
        jd_text: str,
    ) -> str:
        """Return a short paragraph explaining why the candidate is at this rank
        and what candidates ranked above them have that they don't."""

    @abstractmethod
    async def get_embedding(self, text: str) -> list[float]:
        """Return a dense float vector for the given text (e.g. 1536-d for text-embedding-3-small)."""

    @abstractmethod
    async def generate_career_profile(self, resume_text: str) -> dict:
        """
        Analyse a resume and return a career profile dict with keys:
          detected_role (str), detected_level_label (str), next_level_label (str),
          strengths (list[str]), weaknesses (list[str]), summary (str),
          upgrade_path (list[{area, why, sub_skills}]).
        """
