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
    # Computed in router
    total_applicants: int = 0
    active_applications: int = 0   # accepted count (backwards compat)
    pool_count: int = 0
    avg_score: float = 0.0
    eligibility_criteria: Optional[EligibilityCriteriaResponse] = None

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
