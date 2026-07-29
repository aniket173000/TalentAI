import json as _json

from pydantic import BaseModel, EmailStr, field_validator
from typing import Literal, Optional, List
from datetime import datetime
import models as _models
from services.admin_access import is_admin_email as _is_admin_email


# ── Auth ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    # account_type drives which extension row is created on registration
    account_type: Literal["recruiter", "candidate"] = "candidate"
    # recruiter-only fields (ignored when account_type == "candidate")
    company: Optional[str] = None
    is_third_party_recruiter: bool = False


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    phone: Optional[str] = None
    created_at: datetime
    linkedin_verified: bool = False
    email_verified: bool = False
    is_admin: bool = False

    # Capability flags — derived from which extension rows exist
    is_candidate: bool = False
    is_recruiter: bool = False

    # Candidate-specific (populated only when is_candidate=True)
    onboarding_completed: bool = False
    candidate_linkedin_url: Optional[str] = None
    current_company: Optional[str] = None
    college_name: Optional[str] = None
    graduation_year: Optional[int] = None
    is_graduated: Optional[bool] = None
    college_logo_url: Optional[str] = None
    # All institutions the user is/was a member of — used to gate campus-hiring visibility
    education_institutions: List[str] = []

    # Recruiter-specific (populated only when is_recruiter=True)
    company: Optional[str] = None
    is_third_party_recruiter: bool = False
    recruiter_onboarding_completed: bool = False

    class Config:
        from_attributes = True

    @classmethod
    def from_user(cls, user: "_models.User") -> "UserResponse":
        """Build a UserResponse from a fully-loaded User ORM object."""
        c = user.candidate_ext
        r = user.recruiter_ext
        ed = user.primary_education

        return cls(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            phone=user.phone,
            created_at=user.created_at,
            linkedin_verified=bool(user.linkedin_verified),
            email_verified=bool(user.email_verified),
            is_admin=_is_admin_email(user.email),
            is_candidate=c is not None,
            is_recruiter=r is not None,
            # candidate fields
            onboarding_completed=bool(c.onboarding_completed) if c else False,
            candidate_linkedin_url=c.candidate_linkedin_url if c else None,
            current_company=c.current_company if c else None,
            college_name=ed.institution_name if ed else None,
            graduation_year=ed.graduation_year if ed else None,
            is_graduated=ed.is_graduated if ed else None,
            college_logo_url=(ed.college.logo_url if ed and ed.college else None),
            education_institutions=[
                e.institution_name
                for e in (user.education_records or [])
                if e.institution_name
            ],
            # recruiter fields
            company=r.company if r else None,
            is_third_party_recruiter=bool(r.is_third_party) if r else False,
            recruiter_onboarding_completed=bool(r.onboarding_completed) if r else False,
        )


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


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
    salary_currency: Optional[str] = None
    remote_policy: Optional[Literal["On-site", "Remote", "Hybrid"]] = None
    application_deadline: Optional[datetime] = None
    eligibility_criteria: Optional[EligibilityCriteriaIn] = None
    is_third_party: bool = False
    is_fresher_friendly: bool = False
    is_campus_hiring: bool = False
    campus_college_name: Optional[str] = None


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
    salary_currency: Optional[str] = None
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
    salary_currency: Optional[str] = None
    remote_policy: Optional[str] = None
    application_deadline: Optional[datetime] = None
    published_at: Optional[datetime] = None
    created_at: datetime
    is_third_party: bool = False
    is_fresher_friendly: bool = False
    is_campus_hiring: bool = False
    campus_college_name: Optional[str] = None
    # Recruiter who posted the job — set by router
    recruiter_name: Optional[str] = None
    recruiter_is_third_party: bool = False
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

    @field_validator("jd_requirements", mode="before")
    @classmethod
    def _parse_jd_requirements(cls, v):
        # The ORM column is a raw JSON string (TEXT). When model_validate(job)
        # reads it via from_attributes, parse it into a dict so it can coerce
        # into JDRequirements; tolerate already-parsed values and bad JSON.
        if isinstance(v, str):
            try:
                return _json.loads(v)
            except Exception:
                return None
        return v

    class Config:
        from_attributes = True


class JobListResponse(BaseModel):
    jobs: List[JobResponse]
    total: int
    page: int
    pages: int
    per_page: int


class CampusJobResponse(BaseModel):
    id: int
    title: str
    company: str
    company_logo_url: Optional[str] = None
    location: str
    employment_type: Optional[str] = None
    remote_policy: Optional[str] = None
    salary_range_min: Optional[int] = None
    salary_range_max: Optional[int] = None
    salary_currency: Optional[str] = None
    application_deadline: Optional[datetime] = None
    slug: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Applications ──────────────────────────────────────────────────────────────

class ApplicationResponse(BaseModel):
    id: int
    job_id: int
    job_title: Optional[str] = None
    job_company: Optional[str] = None
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

# ── College / University ──────────────────────────────────────────────────────

class CollegeUpdate(BaseModel):
    college_name: str
    graduation_year: Optional[int] = None
    is_graduated: bool = False
    college_url: Optional[str] = None          # website or LinkedIn URL — logo resolved server-side
    candidate_linkedin_url: Optional[str] = None
    current_company: Optional[str] = None       # alumni only


class CollegeAIInfo(BaseModel):
    short_name: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    founded_year: Optional[int] = None
    highlights: List[str] = []
    talent_strengths: List[str] = []


class CollegeCandidateEntry(BaseModel):
    id: int
    full_name: str
    email: str
    graduation_year: Optional[int] = None
    is_graduated: bool = False
    candidate_linkedin_url: Optional[str] = None
    current_company: Optional[str] = None


class CollegeInfo(BaseModel):
    college_name: str
    short_name: Optional[str] = None
    college_logo_url: Optional[str] = None
    current_students: int = 0
    alumni: int = 0
    total: int = 0


class CollegeTalentStats(BaseModel):
    top_companies: List[str] = []
    top_skills: List[str] = []


class CollegeDetailResponse(BaseModel):
    college_name: str
    short_name: Optional[str] = None
    college_logo_url: Optional[str] = None
    website_url: Optional[str] = None
    ai_info: Optional[CollegeAIInfo] = None
    talent_stats: CollegeTalentStats = CollegeTalentStats()
    current_students: List[CollegeCandidateEntry] = []
    alumni: List[CollegeCandidateEntry] = []


# Resolve forward references after all models are defined
JobResponse.model_rebuild()


# ── AI Fluency Assignments ────────────────────────────────────────────────────

class AssignmentCreate(BaseModel):
    job_id: int
    title: str
    brief: str
    evaluation_focus: Optional[str] = None
    deadline: Optional[datetime] = None

    @field_validator("title", "brief")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must not be blank")
        return v.strip()


class AssignmentUpdate(BaseModel):
    title: Optional[str] = None
    brief: Optional[str] = None
    evaluation_focus: Optional[str] = None
    deadline: Optional[datetime] = None
    status: Optional[Literal["active", "closed"]] = None


class AssignmentResponse(BaseModel):
    id: int
    job_id: int
    title: str
    brief: str
    evaluation_focus: Optional[str] = None
    deadline: Optional[datetime] = None
    required_tool: str
    status: str
    created_at: datetime
    submission_counts: dict = {}

    class Config:
        from_attributes = True


class InviteRequest(BaseModel):
    # Invite by existing applications to the job, and/or ad-hoc by email.
    application_ids: List[int] = []
    emails: List[EmailStr] = []


class SubmissionResponse(BaseModel):
    id: int
    assignment_id: int
    application_id: Optional[int] = None
    candidate_name: str
    candidate_email: str
    status: str
    error: Optional[str] = None
    session_count: Optional[int] = None
    repo_url: Optional[str] = None
    invited_at: datetime
    submitted_at: Optional[datetime] = None
    analyzed_at: Optional[datetime] = None
    overall_score: Optional[float] = None      # populated when analyzed
    integrity_confidence: Optional[str] = None
    mcp_connected_at: Optional[datetime] = None   # first Claude Code MCP handshake, if any
    mcp_last_seen_at: Optional[datetime] = None   # most recent MCP tool call, if any

    class Config:
        from_attributes = True


class RecruiterMcpKeyIssueResponse(BaseModel):
    id: int
    key: str                # shown ONCE — not retrievable again after this response
    connect_command: str
    created_at: datetime

    class Config:
        from_attributes = True


class ConnectTokenRequest(BaseModel):
    # Candidate need not have any prior Nideknil account or Application — a partner
    # platform (e.g. Bhume) calls this with just enough to find-or-create a submission.
    candidate_email: EmailStr
    candidate_name: Optional[str] = None


class ConnectTokenResponse(BaseModel):
    submission_id: int
    access_token: str        # fresh on every call — the previous one stops working
    connect_command: str


class ConnectionStatusResponse(BaseModel):
    connected: bool
    connected_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None


class RecruiterMcpKeyResponse(BaseModel):
    id: int
    created_at: datetime
    last_used_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FluencyReportResponse(BaseModel):
    submission_id: int
    candidate_name: str
    overall_score: float
    summary: str
    dimensions: list
    highlights: dict
    metrics: dict
    integrity_flags: list
    integrity_confidence: Optional[str] = None
    provider: Optional[str] = None
    chunk_model: Optional[str] = None
    aggregate_model: Optional[str] = None
    created_at: datetime


class CandidateAssignmentView(BaseModel):
    """What the candidate sees at /assignment/{token} — no recruiter internals."""
    assignment_title: str
    brief: str
    deadline: Optional[datetime] = None
    required_tool: str
    company: str
    job_title: str
    candidate_name: str
    status: str
    submitted_at: Optional[datetime] = None
    assignment_open: bool


# ── AI Fluency Team Report ("Pulse") ───────────────────────────────────────────

class OrgCreate(BaseModel):
    name: str
    cadence: Literal["weekly", "monthly"] = "monthly"
    region: Literal["IN", "US"] = "IN"


class OrgResponse(BaseModel):
    id: int
    name: str
    cadence: str
    plan: str
    seats_limit: int
    region: str
    active_seats: int = 0
    trial_ends_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SeatInviteRequest(BaseModel):
    emails: List[EmailStr]
    role: Literal["engineer", "exec", "admin"] = "engineer"


class SeatResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    role: str
    status: str
    share_individual_report: bool = False
    playbook_attribution: bool = False
    connected_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None
    invited_at: datetime

    class Config:
        from_attributes = True


class SeatInviteResult(BaseModel):
    """Returned to the admin right after inviting — includes the connect command
    the engineer must run (contains their seat token, shown once to the admin so
    it can be relayed; also emailed)."""
    seat: SeatResponse
    connect_command: str


class ConsentUpdate(BaseModel):
    share_individual_report: Optional[bool] = None
    playbook_attribution: Optional[bool] = None


class PulseReportResponse(BaseModel):
    submission_id: int
    period_label: str
    overall_score: float
    summary: str
    dimensions: list
    highlights: dict
    metrics: dict
    integrity_flags: list
    integrity_confidence: Optional[str] = None
    created_at: datetime


class PulsePortalView(BaseModel):
    """What an invited engineer sees at /pulse/portal/{token} — consent screen +
    setup instructions. No team/other-engineer data."""
    org_name: str
    engineer_name: Optional[str] = None
    cadence: str
    status: str                         # invited | active
    consented: bool
    current_period_label: str
    latest_status: Optional[str] = None  # latest submission status, if any
    connect_command: str
    submit_command: str


class LeaderboardEntry(BaseModel):
    name: str                           # "Anonymous engineer" unless opted in
    overall_score: float
    attributed: bool


class TeamDashboardResponse(BaseModel):
    org_id: int
    period_label: str
    team_index: Optional[float] = None
    seats_reporting: int = 0
    seats_active: int = 0
    adoption: float = 0.0               # seats_reporting / seats_active
    dimension_averages: dict = {}
    gap_heatmap: list = []
    trend: list = []
    leaderboard: List[LeaderboardEntry] = []


class PlaybookEntryResponse(BaseModel):
    id: int
    period_label: str
    dimension_key: Optional[str] = None
    technique: str
    evidence: Optional[str] = None
    attributed_name: Optional[str] = None  # None => anonymized

    class Config:
        from_attributes = True


class PlanResponse(BaseModel):
    key: str
    name: str
    seats_limit: int
    cadence: str
    price_minor: int
    currency: str
    features: List[str]


class EarlyAccessRequest(BaseModel):
    email: EmailStr
    company: Optional[str] = None
    team_size: Optional[str] = None
    note: Optional[str] = None


class PulseAccessStatus(BaseModel):
    has_access: bool
    status: str   # granted | requested | denied | none


class PulseAccessRequestRow(BaseModel):
    id: int
    email: str
    company: Optional[str] = None
    team_size: Optional[str] = None
    note: Optional[str] = None
    status: str
    created_at: datetime
