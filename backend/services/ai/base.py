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
          gaps (list), improvement_suggestions (list), summary (str),
          ai_fluency ({score 0-100, signals list[str], rationale str}).
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

    @abstractmethod
    async def parse_jd_requirements(self, jd_text: str, job_title: str) -> dict:
        """
        Parse a job description into structured hiring requirements.

        Returns a dict matching the JDRequirements schema (minus version/jd_hash/parsed_at,
        which are stamped by the caller):
          seniority            (str | None)   Junior/Mid/Senior/Lead/Principal/Executive
          industry             (str | None)
          job_function         (str | None)
          min_years_experience (int | None)
          max_years_experience (int | None)
          education_level      (str | None)   Diploma/Bachelor/Master/PhD
          education_field      (str | None)
          required_skill_groups (list[dict])  [{skills, match_type, required, context}]
            match_type="any"  → OR  (candidate needs ONE of the skills)
            match_type="all"  → AND (candidate needs ALL the skills)
          preferred_skills     (list[str])    flat nice-to-have skills
          key_responsibilities (list[str])

        Malformed JSON must trigger up to 3 automatic retries before raising.
        """

    @abstractmethod
    async def generate_displacement_comparison(
        self,
        rank1_resume: str,
        rank1_score: float,
        displaced_resume: str,
        displaced_score: float,
        jd_text: str,
        job_title: str,
    ) -> dict:
        """
        Compare the displaced candidate's profile against the rank-1 candidate.
        Returns a dict with keys:
          rank1_key_strengths  (list[str])  — what makes rank-1 stand out
          comparison           (list[dict]) — [{area, rank1_has, you_have, improvement}]
          encouragement        (str)        — closing motivational note
        """

    @abstractmethod
    async def verify_skill_claims(self, skills: list[str], resume_text: str) -> dict:
        """
        For each skill in `skills`, determine whether the candidate's work history
        or project descriptions in `resume_text` provide genuine evidence of that skill.

        Returns a dict keyed by skill name:
          { "skill": { "has_evidence": bool, "confidence": float 0-1, "reason": str } }
        """

    @abstractmethod
    async def generate_readiness_roadmap(
        self,
        jd_text: str,
        resume_text: str,
        job_title: str,
        current_score: float,
        gaps: list,
        improvement_suggestions: list,
        fresher_mode: bool = False,
    ) -> dict:
        """
        Generate a student-friendly readiness roadmap.

        Returns a dict with keys:
          readiness_label       (str)        — Just Starting | Building Up | Getting There | Almost Ready | Ready to Apply
          roadmap               (list[dict]) — [{skill_area, current, action, resource_hint, estimated_gain}]
          quick_wins            (list[str])  — actions completable today
          encouragement         (str)        — one punchy motivating sentence
        """

    @abstractmethod
    async def extract_structured_profile(self, resume_text: str) -> dict:
        """
        Extract structured fields from free-form resume text.

        Returns a dict with keys:
          full_name      (str | None)
          email          (str | None)
          phone          (str | None)
          location       (str | None)
          total_yoe      (float | None)  — total professional years of experience
          work_history   (list[dict])    — [{company, title, start_date, end_date, description, highlights: list[str]}]
          raw_skills     (list[str])     — skills exactly as written in the resume
          education      (list[dict])    — [{degree, institution, year}]
          projects       (list[dict])    — [{name, description, technologies}]
          certifications (list[str])
          confidence_scores (dict)       — {field_name: float 0.0-1.0} per extracted field

        Malformed JSON must trigger up to 3 automatic retries before raising.
        """

    @abstractmethod
    async def answer_question(self, context: str, question: str) -> str:
        """
        Free-form Q&A grounded in a supplied context blob (used by the recruiter MCP
        copilot — routers/mcp_recruiter.py — to answer questions about a candidate's
        AI-fluency report + resume, and to draft interview questions). Plain-text
        answer, no JSON contract — the caller supplies the full prompt/instructions
        as part of `question`.
        """
