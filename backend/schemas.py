from pydantic import BaseModel, EmailStr
from typing import Literal, Optional, List
from datetime import datetime


# ── Auth ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: Literal["recruiter", "candidate"] = "candidate"
    company: Optional[str] = None
    is_third_party_recruiter: bool = False


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    created_at: datetime
    linkedin_verified: bool = False
    company: Optional[str] = None
    is_third_party_recruiter: bool = False

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    role: Optional[Literal["recruiter", "candidate"]] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ── Eligibility Criteria ──────────────────────────────────────────────────────

EducationLevel = Literal["None", "Diploma", "Bachelor", "Master", "PhD"]


class EligibilityCriteriaIn(BaseModel):
    min_years_experience: Optional[int] = None
    required_skills: List[str] = []
    required_education: Optional[EducationLevel] = None


class EligibilityCriteriaResponse(BaseModel):
    min_years_experience: Optional[int] = None
    required_skills: List[str] = []
    required_education: Optional[str] = None

    class Config:
        from_attributes = True


# ── Jobs ──────────────────────────────────────────────────────────────────────

class JobCreate(BaseModel):
    title: str
    jd_text: str
    company: str = "Our Company"
    company_url: Optional[str] = None
    location: str = "Remote"
    max_count: int = 10
    min_match_score: float = 80.0
    department: Optional[str] = None
    employment_type: Optional[Literal["Full-time", "Part-time", "Contract", "Internship"]] = None
    salary_range_min: Optional[int] = None
    salary_range_max: Optional[int] = None
    remote_policy: Optional[Literal["On-site", "Remote", "Hybrid"]] = None
    application_deadline: Optional[datetime] = None
    eligibility_criteria: Optional[EligibilityCriteriaIn] = None
    is_third_party: bool = False
    is_fresher_friendly: bool = False


class JobUpdate(BaseModel):
    title: Optional[str] = None
    jd_text: Optional[str] = None
    company: Optional[str] = None
    company_url: Optional[str] = None
    location: Optional[str] = None
    max_count: Optional[int] = None
    min_match_score: Optional[float] = None
    department: Optional[str] = None
    employment_type: Optional[str] = None
    salary_range_min: Optional[int] = None
    salary_range_max: Optional[int] = None
    remote_policy: Optional[str] = None
    application_deadline: Optional[datetime] = None
    eligibility_criteria: Optional[EligibilityCriteriaIn] = None
    is_fresher_friendly: Optional[bool] = None


class JobAuditLogResponse(BaseModel):
    id: int
    field_name: str
    old_value: Optional[str]
    new_value: Optional[str]
    changed_at: datetime
    actor_name: str = ""

    class Config:
        from_attributes = True


class JobResponse(BaseModel):
    id: int
    title: str
    jd_text: str
    company: str
    company_url: Optional[str] = None
    company_logo_url: Optional[str] = None
    location: str
    max_count: int
    min_match_score: float
    status: str = "draft"
    slug: Optional[str] = None
    department: Optional[str] = None
    employment_type: Optional[str] = None
    salary_range_min: Optional[int] = None
    salary_range_max: Optional[int] = None
    remote_policy: Optional[str] = None
    application_deadline: Optional[datetime] = None
    published_at: Optional[datetime] = None
    created_at: datetime
    is_third_party: bool = False
    is_fresher_friendly: bool = False
    # Computed in router
    total_applicants: int = 0
    active_applications: int = 0   # accepted count (backwards compat)
    pool_count: int = 0
    avg_score: float = 0.0
    eligibility_criteria: Optional[EligibilityCriteriaResponse] = None

    # JD parsing (E5-S1) — set by router, never read direct from ORM
    jd_parse_status: Optional[str] = None              # None | "pending" | "done" | "failed"
    jd_parse_error: Optional[str] = None               # non-null only when status=="failed"
    jd_requirements: Optional["JDRequirements"] = None   # parsed when status=="done"

    class Config:
        from_attributes = True


class JobListResponse(BaseModel):
    jobs: List[JobResponse]
    total: int
    page: int
    pages: int
    per_page: int


# ── Applications ──────────────────────────────────────────────────────────────

class ApplicationResponse(BaseModel):
    id: int
    job_id: int
    candidate_name: str
    candidate_email: str
    match_score: float
    rank: Optional[int]
    status: str
    candidate_status: str = "rejected"
    status_token: Optional[str] = None
    strengths: Optional[str]
    gaps: Optional[str]
    improvement_suggestions: Optional[str]
    project_scores: Optional[str] = None
    applied_at: datetime

    class Config:
        from_attributes = True


# ── Public application status ─────────────────────────────────────────────────

class ApplicationStatusPublic(BaseModel):
    candidate_status: str
    job_title: str
    company: str
    applied_at: datetime
    score_tier: Optional[str] = None      # "Top 25" / "Top 50" / "Top 100" — pool members only
    status_feedback: Optional[str] = None  # recruiter feedback for interview_rejected

    class Config:
        from_attributes = True


class ApplicationStatusUpdate(BaseModel):
    candidate_status: Literal[
        "rejected", "pool_accepted",
        "under_review", "interview_scheduled", "offer_extended", "interview_rejected",
    ]
    feedback: Optional[str] = None  # required (strongly recommended) for interview_rejected


# ── Structured Resume Profile ─────────────────────────────────────────────────

class WorkEntry(BaseModel):
    company: str
    title: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None   # "Present" is a valid value
    description: Optional[str] = None


class EducationEntry(BaseModel):
    degree: str
    institution: str
    year: Optional[str] = None


class ProjectEntry(BaseModel):
    name: str
    description: Optional[str] = None
    technologies: List[str] = []
    url: Optional[str] = None   # GitHub/demo URL — counted as open-source signal


class ConfidenceScores(BaseModel):
    full_name: float = 0.0
    email: float = 0.0
    phone: float = 0.0
    location: float = 0.0
    total_yoe: float = 0.0
    work_history: float = 0.0
    raw_skills: float = 0.0
    education: float = 0.0
    projects: float = 0.0
    certifications: float = 0.0


class ExtractedResumeProfile(BaseModel):
    """Full structured profile returned from the extract endpoint."""
    id: int
    user_id: Optional[int] = None
    application_id: Optional[int] = None

    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    total_yoe: Optional[float] = None

    work_history: List[WorkEntry] = []
    raw_skills: List[str] = []
    normalized_skills: List[str] = []
    unmapped_skills: List[str] = []
    education: List[EducationEntry] = []
    projects: List[ProjectEntry] = []
    certifications: List[str] = []

    confidence_scores: Optional[ConfidenceScores] = None
    taxonomy_version: Optional[str] = None
    extracted_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ExtractProfileRequest(BaseModel):
    """Request body for the extract endpoint."""
    resume_text: str
    application_id: Optional[int] = None   # link result to an application row


# ── JD Requirements (E5-S1) ───────────────────────────────────────────────────

SeniorityLevel = Literal["Junior", "Mid", "Senior", "Lead", "Principal", "Executive"]


class SkillGroup(BaseModel):
    """
    One logical requirement from the JD.

    match_type="any"  → OR  — candidate needs at least ONE skill (e.g. "Java or Python")
    match_type="all"  → AND — candidate needs ALL skills  (e.g. "React and TypeScript")
    required=True     → must-have; missing this group penalises the candidate
    required=False    → nice-to-have; used only for bonus scoring
    """
    skills: List[str]
    match_type: Literal["any", "all"]
    required: bool
    context: str = ""   # original phrase from JD — for explainability


class JDRequirements(BaseModel):
    """
    Structured requirements extracted from a job description by the AI parser.
    Stored as a JSON blob on Job.jd_requirements.
    Version-stamped so the scoring engine can adapt to schema evolution.
    """
    version: str
    jd_hash: str        # SHA-256 of jd_text — used to skip re-parsing unchanged JDs
    parsed_at: str

    # Role context
    seniority: Optional[SeniorityLevel] = None
    industry: Optional[str] = None
    job_function: Optional[str] = None

    # Experience gate
    min_years_experience: Optional[int] = None
    max_years_experience: Optional[int] = None

    # Education gate
    education_level: Optional[Literal["Diploma", "Bachelor", "Master", "PhD"]] = None
    education_field: Optional[str] = None

    # Skills — the core structured output consumed by the scoring engine
    required_skill_groups: List[SkillGroup] = []
    preferred_skills: List[str] = []

    key_responsibilities: List[str] = []

# Resolve forward references after all models are defined
JobResponse.model_rebuild()
