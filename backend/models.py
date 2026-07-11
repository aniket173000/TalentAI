from sqlalchemy import Boolean, Column, ForeignKey, Index, Integer, String, Float, Text, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


# ── Supporting / lookup tables ────────────────────────────────────────────────

class College(Base):
    """
    One row per unique college name.
    Created when the first candidate from that college completes onboarding.
    AI-generated fields are populated as a background task.
    """
    __tablename__ = "colleges"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(500), unique=True, nullable=False, index=True)
    short_name = Column(String(20), nullable=True)
    logo_url = Column(String(1000), nullable=True)
    website_url = Column(String(500), nullable=True)
    ai_info = Column(Text, nullable=True)                   # JSON: description, highlights, etc.
    created_at = Column(DateTime, server_default=func.now())


class CollegeAlias(Base):
    """
    Cache mapping any free-text college spelling a user enters to the canonical
    college name it resolves to. Lets "Indian Institute of Information Technology
    Nagpur" and "IIIT Nagpur" both land on the same college page.

    `alias_key` is the normalised (lowercased, punctuation-stripped) form of the
    raw input, so trivial variations share one row. `canonical_name` is the
    resolved display name used as `UserEducation.institution_name`.
    """
    __tablename__ = "college_aliases"

    id = Column(Integer, primary_key=True, index=True)
    alias_key = Column(String(500), unique=True, nullable=False, index=True)
    canonical_name = Column(String(500), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())


class CompanyLogo(Base):
    """
    Shared logo cache for company names (work history, current company, recruiter
    affiliation, etc.). Companies are free-text across the app, so this dedupes
    logo resolution to ONE network lookup per normalised name — every surface
    reads from here. Colleges have their own normalised `colleges` table.

    `status` is "resolved" (logo found), "failed" (looked up, nothing found —
    negative-cached so we don't hammer the network), or "pending".
    """
    __tablename__ = "company_logos"

    id = Column(Integer, primary_key=True, index=True)
    name_key = Column(String(255), unique=True, nullable=False, index=True)  # normalised name
    display_name = Column(String(255), nullable=True)                        # original, for debugging
    logo_url = Column(String(1000), nullable=True)
    website_url = Column(String(500), nullable=True)
    status = Column(String(20), default="resolved")
    resolved_at = Column(DateTime, server_default=func.now())


# ── Core identity ─────────────────────────────────────────────────────────────

class User(Base):
    """
    One row per person — no role field.
    Capabilities are determined by which extension rows exist:
      candidate_ext   → can apply to jobs, upload resumes, etc.
      recruiter_ext   → can post jobs, view applicants, etc.
    A user can have BOTH extensions simultaneously.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=True)    # nullable for OAuth-only accounts
    full_name = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)
    email_verified = Column(Boolean, default=False)         # True after signup OTP or OAuth
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Identity enrichment
    headline = Column(String(255), nullable=True)        # "SWE @ Google · Ex-Meta"
    about = Column(Text, nullable=True)                  # user-written About; overrides AI career summary
    avatar_url = Column(String(500), nullable=True)      # S3 public URL

    # LinkedIn OAuth
    linkedin_id = Column(String(255), nullable=True, index=True)
    linkedin_verified = Column(Boolean, default=False)

    # Google OAuth
    google_id = Column(String(255), nullable=True, index=True)

    # Two-factor authentication
    totp_secret = Column(String(255), nullable=True)
    totp_enabled = Column(Boolean, default=False)

    # ── Subscription / billing ────────────────────────────────────────────────
    plan = Column(String(20), default="free", nullable=False)
    plan_expires_at = Column(DateTime, nullable=True)
    razorpay_payment_id = Column(String(255), nullable=True)

    # ── Capability extensions (one-to-one, optional) ──────────────────────────
    candidate_ext = relationship(
        "CandidateExtension", back_populates="user", uselist=False,
        cascade="all, delete-orphan",
    )
    recruiter_ext = relationship(
        "RecruiterExtension", back_populates="user", uselist=False,
        cascade="all, delete-orphan",
    )

    # ── Normalised education history (one-to-many) ────────────────────────────
    education_records = relationship(
        "UserEducation", back_populates="user", cascade="all, delete-orphan",
        order_by="UserEducation.is_primary.desc()",
    )

    # ── Activity relationships ─────────────────────────────────────────────────
    applications = relationship("Application", back_populates="user")
    resumes = relationship(
        "UserResume", back_populates="user",
        order_by="desc(UserResume.uploaded_at)",
    )
    work_experiences = relationship(
        "WorkExperience", back_populates="user", cascade="all, delete-orphan",
        order_by="desc(WorkExperience.start_year)",
    )

    # ── Computed helpers (no DB columns) ─────────────────────────────────────
    @property
    def is_candidate(self) -> bool:
        return self.candidate_ext is not None

    @property
    def is_recruiter(self) -> bool:
        return self.recruiter_ext is not None

    @property
    def primary_education(self) -> "UserEducation | None":
        for ed in (self.education_records or []):
            if ed.is_primary:
                return ed
        return self.education_records[0] if self.education_records else None


# ── Capability extension tables ───────────────────────────────────────────────

class CandidateExtension(Base):
    """
    Candidate-mode data.  Existence of this row = user has candidate capability.
    Holds resume cache, AI career profile, magic-match state, and onboarding status.
    """
    __tablename__ = "candidate_extensions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)

    # Onboarding
    onboarding_completed = Column(Boolean, default=False)
    candidate_linkedin_url = Column(String(500), nullable=True)
    portfolio_link = Column(String(500), nullable=True)     # personal portfolio / website URL
    current_company = Column(String(255), nullable=True)    # alumni: current employer
    current_company_logo_url = Column(String(1000), nullable=True)  # user-picked override; falls back to shared cache

    # Active profile resume (fast-access copy; full vault lives in user_resumes)
    resume_text = Column(Text, nullable=True)
    resume_filename = Column(String(255), nullable=True)

    # AI-generated career insights
    career_profile = Column(Text, nullable=True)            # JSON blob — CareerProfile schema
    career_profile_updated_at = Column(DateTime, nullable=True)

    # Semantic matching cache
    profile_embedding = Column(Text, nullable=True)         # JSON float list
    magic_match_date = Column(String(10), nullable=True)    # ISO date — rate-limit key
    magic_match_cache = Column(Text, nullable=True)         # JSON of last magic-match results

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="candidate_ext")


class RecruiterExtension(Base):
    """
    Recruiter-mode data.  Existence of this row = user has recruiter capability.
    Holds company affiliation and third-party flag.
    """
    __tablename__ = "recruiter_extensions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)

    company = Column(String(255), nullable=True)
    is_third_party = Column(Boolean, default=False)         # agency / staffing firm

    # Onboarding
    onboarding_completed = Column(Boolean, default=False)

    # Active profile resume (fast-access copy; full vault lives in user_resumes)
    resume_text = Column(Text, nullable=True)
    resume_filename = Column(String(255), nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="recruiter_ext")


class UserEducation(Base):
    """
    Normalised education history — one row per institution per user.
    Allows multi-college profiles (transfer students, dual degrees) and
    future enrichment (courses, certifications) without schema changes.
    """
    __tablename__ = "user_education"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Link to the canonical College record (nullable — allows unverified colleges)
    college_id = Column(Integer, ForeignKey("colleges.id"), nullable=True, index=True)
    institution_name = Column(String(500), nullable=False)  # denormalized for display speed

    # Academic details
    degree_type = Column(String(100), nullable=True)        # Bachelor / Master / PhD / Diploma
    field_of_study = Column(String(255), nullable=True)
    graduation_year = Column(Integer, nullable=True)
    is_graduated = Column(Boolean, nullable=True)           # True=alumnus, False=current student

    is_primary = Column(Boolean, default=True)              # the credential shown on profile card
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="education_records")
    college = relationship("College")


# ── Resume vault ──────────────────────────────────────────────────────────────

class UserResume(Base):
    __tablename__ = "user_resumes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    resume_text = Column(Text, nullable=False)
    is_primary = Column(Boolean, default=False)
    uploaded_at = Column(DateTime, server_default=func.now())
    file_key = Column(String(500), nullable=True)           # S3 key for original uploaded file

    user = relationship("User", back_populates="resumes")


# ── Structured resume extraction ──────────────────────────────────────────────

class CandidateProfile(Base):
    """
    LLM-extracted structured resume data.
    One row per extraction; multiple rows can exist per user
    (one per application, or one per resume upload).
    Use source_resume_hash to avoid re-extracting identical resume text.
    """
    __tablename__ = "candidate_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), nullable=True, index=True)
    source_resume_hash = Column(String(64), nullable=True, index=True)

    full_name = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(100), nullable=True)
    location = Column(String(255), nullable=True)
    total_yoe = Column(Float, nullable=True)

    work_history = Column(Text, nullable=True)
    raw_skills = Column(Text, nullable=True)
    normalized_skills = Column(Text, nullable=True)
    unmapped_skills = Column(Text, nullable=True)
    education = Column(Text, nullable=True)
    projects = Column(Text, nullable=True)
    certifications = Column(Text, nullable=True)

    confidence_scores = Column(Text, nullable=True)

    taxonomy_version = Column(String(50), nullable=True)
    extracted_at = Column(DateTime, server_default=func.now())

    user = relationship("User", foreign_keys=[user_id])


class SkillReviewQueue(Base):
    """Skills extracted from resumes that had no match in the taxonomy."""
    __tablename__ = "skill_review_queue"

    id = Column(Integer, primary_key=True, index=True)
    skill_name = Column(String(255), nullable=False, unique=True)
    occurrence_count = Column(Integer, default=1, nullable=False)
    first_seen_at = Column(DateTime, server_default=func.now())
    last_seen_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class CandidateJobScore(Base):
    """
    Composite suitability score for a (candidate, job) pair — E5-S6.
    Immutable history: each scoring run inserts a new row, keyed by inputs_hash
    for idempotency. Previously created only via raw migration; modelled here so
    create_all() builds it on a fresh database (e.g. Postgres).
    """
    __tablename__ = "candidate_job_scores"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), nullable=False)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    candidate_profile_id = Column(Integer, ForeignKey("candidate_profiles.id"), nullable=True)

    model_version = Column(String(20), nullable=False)
    skills_score = Column(Float, nullable=True)
    experience_score = Column(Float, nullable=True)
    education_score = Column(Float, nullable=True)
    projects_score = Column(Float, nullable=True)
    composite_score = Column(Float, nullable=False)
    breakdown = Column(Text, nullable=True)
    inputs_hash = Column(String(64), nullable=False)
    scored_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_candidate_job_scores_app_job", "application_id", "job_id"),
        Index("ix_candidate_job_scores_inputs_hash", "inputs_hash"),
    )


# ── Recruiter candidate corpus (pull-side ingestion) ──────────────────────────

class Candidate(Base):
    """
    A candidate in a recruiter's searchable corpus (the pull side of the funnel).

    Distinct from `users` (people who signed up) and `applications` (the push
    flow). A recruiter ingests a resume → it is parsed, structured-extracted,
    summarised into a profile blurb, and embedded for vector retrieval.

    Structured fields mirror CandidateProfile; embeddings are stored as JSON
    text for now and converted to a pgvector column in a later phase.
    """
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, index=True)
    # Platform candidates (synced from the candidate base) are owned by no
    # recruiter and link to the source user; manually-uploaded ones set recruiter_id.
    recruiter_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    source = Column(String(20), nullable=False, default="upload")  # platform | upload | application
    source_resume_hash = Column(String(64), nullable=True, index=True)

    # Contact / headline
    full_name = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(100), nullable=True)
    location = Column(String(255), nullable=True)
    headline = Column(String(255), nullable=True)   # derived title e.g. "Senior Backend Engineer"
    total_yoe = Column(Float, nullable=True)

    # Raw + structured profile (JSON text)
    resume_text = Column(Text, nullable=True)
    resume_filename = Column(String(255), nullable=True)
    resume_file_key = Column(String(500), nullable=True)   # S3 key
    work_history = Column(Text, nullable=True)
    raw_skills = Column(Text, nullable=True)
    normalized_skills = Column(Text, nullable=True)
    unmapped_skills = Column(Text, nullable=True)
    education = Column(Text, nullable=True)
    projects = Column(Text, nullable=True)
    certifications = Column(Text, nullable=True)
    taxonomy_version = Column(String(50), nullable=True)

    # Embedding inputs/outputs
    profile_summary = Column(Text, nullable=True)          # the text that gets embedded
    profile_embedding = Column(Text, nullable=True)        # JSON list[float]; -> vector(1536) later

    # Ingestion lifecycle
    ingest_status = Column(String(20), nullable=False, default="ready")  # parsing | ready | failed
    ingest_error = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    recruiter = relationship("User", foreign_keys=[recruiter_id])

    __table_args__ = (
        Index("ix_candidates_recruiter_hash", "recruiter_id", "source_resume_hash"),
    )


class CandidateRanking(Base):
    """
    Persisted output of the retrieval funnel for a (job, corpus-candidate) pair.

    Holds every stage's score plus the final blended score and the LLM's
    qualitative evaluation. Powers the recruiter ranking dashboard (display) and
    the feedback loop. A funnel run replaces the prior ranking set for a job.
    """
    __tablename__ = "candidate_rankings"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)
    recruiter_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Stage scores (0-100)
    embed_score = Column(Float, nullable=True)
    skill_score = Column(Float, nullable=True)
    keyword_score = Column(Float, nullable=True)
    rerank_score = Column(Float, nullable=True)
    llm_score = Column(Float, nullable=True)
    experience_score = Column(Float, nullable=True)
    ai_fluency_score = Column(Float, nullable=True)   # how well the candidate uses AI
    ai_fluency_note = Column(Text, nullable=True)      # one-line evidence / rationale
    final_score = Column(Float, nullable=False)

    rank = Column(Integer, nullable=True)
    recommendation = Column(String(30), nullable=True)
    llm_strengths = Column(Text, nullable=True)   # JSON list
    llm_risks = Column(Text, nullable=True)        # JSON list
    llm_summary = Column(Text, nullable=True)

    model_version = Column(String(20), nullable=True)
    ranked_at = Column(DateTime, server_default=func.now())

    candidate = relationship("Candidate", foreign_keys=[candidate_id])

    __table_args__ = (
        Index("ix_candidate_rankings_job", "job_id", "final_score"),
        Index("ix_candidate_rankings_job_candidate", "job_id", "candidate_id"),
    )


class RecruiterFeedback(Base):
    """
    Append-only log of recruiter actions on ranked candidates — the training
    signal for a future learning-to-rank model.

    Each row captures the action plus a snapshot of the funnel scores at action
    time (denormalised so it survives a re-rank that overwrites candidate_rankings).
    Actions: viewed | ignored | shortlisted | contacted | interviewed | rejected | hired.
    """
    __tablename__ = "recruiter_feedback"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)
    recruiter_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    action = Column(String(20), nullable=False)
    notes = Column(Text, nullable=True)

    # Snapshot of the ranking at action time (ML features / labels)
    snapshot_final_score = Column(Float, nullable=True)
    snapshot_rank = Column(Integer, nullable=True)

    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_recruiter_feedback_job_candidate", "job_id", "candidate_id"),
        Index("ix_recruiter_feedback_action", "action"),
    )


class Shortlist(Base):
    """
    Current shortlist set for a job (one row per shortlisted candidate).
    Distinct from the append-only RecruiterFeedback event log: this is mutable
    current state (un-shortlisting deletes the row; the event log is retained).
    """
    __tablename__ = "shortlists"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)
    recruiter_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    candidate = relationship("Candidate", foreign_keys=[candidate_id])

    __table_args__ = (
        UniqueConstraint("job_id", "candidate_id", name="uq_shortlist_job_candidate"),
    )


class RankingRun(Base):
    """
    Tracks one asynchronous run of the ranking funnel for a job. The endpoint
    returns immediately with a run id; the funnel executes in a worker thread and
    updates this row. Results land in candidate_rankings (read via /rankings).
    """
    __tablename__ = "ranking_runs"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False, index=True)
    recruiter_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    status = Column(String(20), nullable=False, default="pending")  # pending|running|done|failed
    top_k = Column(Integer, nullable=True)
    rerank_n = Column(Integer, nullable=True)
    eval_n = Column(Integer, nullable=True)

    retrieved = Column(Integer, nullable=True)
    reranked = Column(Integer, nullable=True)
    evaluated = Column(Integer, nullable=True)
    error = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)


# ── Jobs ──────────────────────────────────────────────────────────────────────

class EligibilityCriteria(Base):
    __tablename__ = "eligibility_criteria"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), unique=True, nullable=False)
    min_years_experience = Column(Integer, nullable=True)
    required_skills = Column(Text, nullable=True)
    required_education = Column(String(50), nullable=True)

    job = relationship("Job", back_populates="criteria")


class JobAuditLog(Base):
    __tablename__ = "job_audit_log"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    field_name = Column(String(100), nullable=False)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    changed_at = Column(DateTime, server_default=func.now())

    actor = relationship("User")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    jd_text = Column(Text, nullable=False)
    company = Column(String(255), default="Our Company")
    location = Column(String(255), default="Remote")
    max_count = Column(Integer, default=10)
    min_match_score = Column(Float, default=80.0)
    created_at = Column(DateTime, server_default=func.now())
    jd_embedding = Column(Text, nullable=True)
    recruiter_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    status = Column(String(50), default="draft")
    slug = Column(String(255), unique=True, index=True, nullable=True)
    department = Column(String(255), nullable=True)
    employment_type = Column(String(100), nullable=True)
    salary_range_min = Column(Integer, nullable=True)
    salary_range_max = Column(Integer, nullable=True)
    salary_currency = Column(String(8), nullable=True)      # ISO code: INR / USD / EUR / GBP
    remote_policy = Column(String(100), nullable=True)
    application_deadline = Column(DateTime, nullable=True)
    published_at = Column(DateTime, nullable=True)
    company_url = Column(String(500), nullable=True)
    company_logo_url = Column(String(1000), nullable=True)
    is_third_party = Column(Boolean, default=False)
    is_fresher_friendly = Column(Boolean, default=False)
    is_campus_hiring = Column(Boolean, default=False)
    campus_college_name = Column(String(500), nullable=True)

    # JD parsing (E5-S1)
    jd_requirements = Column(Text, nullable=True)
    jd_parse_status = Column(String(20), nullable=True)
    jd_parse_error = Column(Text, nullable=True)

    recruiter = relationship("User", foreign_keys=[recruiter_id])
    criteria = relationship("EligibilityCriteria", back_populates="job", uselist=False)
    applications = relationship("Application", back_populates="job")
    audit_logs = relationship("JobAuditLog", foreign_keys=[JobAuditLog.job_id])


# ── Applications ──────────────────────────────────────────────────────────────

class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    candidate_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    candidate_name = Column(String(255), nullable=False)
    candidate_email = Column(String(255), nullable=False)
    resume_text = Column(Text, nullable=False)
    resume_filename = Column(String(255), nullable=True)
    resume_embedding = Column(Text, nullable=True)
    resume_file_key = Column(String(500), nullable=True)
    match_score = Column(Float, nullable=False)
    rank = Column(Integer, nullable=True)
    status = Column(String(50), default="pending")
    candidate_status = Column(String(50), default="received")
    # True once the row has fallen outside the shortlist + reserve pool and had its
    # heavy fields (resume_text/embedding/analysis) pruned to save space. Only a
    # lightweight tombstone remains — enough to block re-application. Never un-set.
    is_archived = Column(Boolean, default=False, nullable=False)
    status_token = Column(String(64), nullable=True, unique=True)
    status_feedback = Column(Text, nullable=True)
    strengths = Column(Text, nullable=True)
    gaps = Column(Text, nullable=True)
    improvement_suggestions = Column(Text, nullable=True)
    project_scores = Column(Text, nullable=True)
    applied_at = Column(DateTime, server_default=func.now())

    job = relationship("Job", back_populates="applications")
    user = relationship("User", foreign_keys=[candidate_user_id], back_populates="applications")


# ── Referral feature ──────────────────────────────────────────────────────────

class PendingRegistration(Base):
    """A signup awaiting email-OTP verification. No `users` row exists yet — the
    account is only created once the OTP is confirmed, so unverified/fake emails
    never pollute the users table."""
    __tablename__ = "pending_registrations"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    account_type = Column(String(20), nullable=False)        # 'candidate' | 'recruiter'
    company = Column(String(255), nullable=True)
    is_third_party = Column(Boolean, default=False)
    otp_hash = Column(String(64), nullable=False)
    attempts = Column(Integer, default=0)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class EmailVerificationOTP(Base):
    __tablename__ = "email_verification_otps"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    work_email = Column(String(255), nullable=False)
    otp_hash = Column(String(64), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())


class ReferralPost(Base):
    __tablename__ = "referral_posts"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(255), unique=True, nullable=True, index=True)
    referrer_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    company_name = Column(String(255), nullable=False)
    company_verified = Column(Boolean, default=False)
    verification_method = Column(String(20), nullable=True)
    work_email_domain = Column(String(255), nullable=True)
    link_type = Column(String(20), default="internal")
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=True)
    external_job_url = Column(String(500), nullable=True)
    jd_raw = Column(Text, nullable=True)
    jd_requirements = Column(Text, nullable=True)
    title = Column(String(255), nullable=False)
    location = Column(String(255), nullable=True)
    employment_type = Column(String(100), nullable=True)
    # Referrer presentation (set by the referrer; powers the Vouch referrer card)
    referrer_title = Column(String(255), nullable=True)     # e.g. "Staff Engineer, Platform"
    referrer_tenure = Column(String(100), nullable=True)    # e.g. "3 yrs at Lumen"
    referrer_note = Column(Text, nullable=True)             # personal note to candidates
    min_match_score = Column(Float, default=40.0)
    pool_size = Column(Integer, default=15)
    waitlist_size = Column(Integer, default=10)
    status = Column(String(30), default="draft")
    opens_at = Column(DateTime, nullable=True)
    closes_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    referrer = relationship("User", foreign_keys=[referrer_user_id])
    applications = relationship("ReferralApplication", back_populates="referral_post")


class ReferralApplication(Base):
    __tablename__ = "referral_applications"

    id = Column(Integer, primary_key=True, index=True)
    referral_post_id = Column(Integer, ForeignKey("referral_posts.id"), nullable=False, index=True)
    candidate_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    resume_text = Column(Text, nullable=False)
    match_score = Column(Float, nullable=False)
    rank = Column(Integer, nullable=True)
    pool_type = Column(String(20), default="pool")
    status = Column(String(30), default="in_pool")
    applied_at = Column(DateTime, server_default=func.now())
    displaced_at = Column(DateTime, nullable=True)
    referred_at = Column(DateTime, nullable=True)

    referral_post = relationship("ReferralPost", back_populates="applications")
    candidate = relationship("User", foreign_keys=[candidate_user_id])


# ── Work experience ───────────────────────────────────────────────────────────

class WorkExperience(Base):
    """
    Work history entries for a user.  One row per position.
    Ordered by start_year DESC so the most recent role shows first.
    """
    __tablename__ = "work_experiences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    company = Column(String(255), nullable=False)
    company_logo_url = Column(String(1000), nullable=True)  # user-picked override; falls back to shared cache
    title = Column(String(255), nullable=False)
    location = Column(String(255), nullable=True)

    start_month = Column(Integer, nullable=True)   # 1–12; null = month unknown
    start_year = Column(Integer, nullable=False)
    end_month = Column(Integer, nullable=True)
    end_year = Column(Integer, nullable=True)      # null = current role
    is_current = Column(Boolean, default=False)

    description = Column(Text, nullable=True)
    order_index = Column(Integer, default=0)       # manual sort override

    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="work_experiences")


# ── Product / user-submitted feedback ────────────────────────────────────────

class ProductFeedback(Base):
    __tablename__ = "product_feedback"

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=True)
    name         = Column(String(255), nullable=True)
    email        = Column(String(255), nullable=True)
    mood         = Column(String(20),  nullable=True)   # love|happy|neutral|frustrated|bug
    raw_text     = Column(Text, nullable=False)

    # AI-derived fields
    category     = Column(String(50),  nullable=True)   # bug|feature_request|ui_ux|performance|praise|question|security|other
    summary      = Column(String(500), nullable=True)   # 1-line AI title
    priority     = Column(String(20),  nullable=True)   # low|medium|high
    sentiment    = Column(String(20),  nullable=True)   # positive|neutral|negative
    affected_area = Column(String(100), nullable=True)  # onboarding|job_search|application|profile|colleges|referrals|recruiter|general

    created_at   = Column(DateTime, server_default=func.now())


# ── AI Fluency Assignments (take-home + transcript analysis) ─────────────────

class Assignment(Base):
    """
    A take-home project a recruiter attaches to a Job. Candidates build it with
    an AI coding tool (v1: Claude Code only) and submit their session
    transcripts; the platform scores how well they used AI against a rubric.
    """
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False, index=True)
    recruiter_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    title = Column(String(255), nullable=False)
    brief = Column(Text, nullable=False)               # project spec shown to the candidate
    evaluation_focus = Column(Text, nullable=True)     # optional recruiter hint ("backend-heavy, care about API design")
    deadline = Column(DateTime, nullable=True)
    # Which AI tool the candidate must use. v1 supports claude_code only, but the
    # column exists so multi-tool support is additive, not a migration.
    required_tool = Column(String(50), default="claude_code", nullable=False)
    status = Column(String(20), default="active", nullable=False)  # active|closed

    created_at = Column(DateTime, server_default=func.now())

    job = relationship("Job", foreign_keys=[job_id])
    recruiter = relationship("User", foreign_keys=[recruiter_id])
    submissions = relationship("AssignmentSubmission", back_populates="assignment")


class AssignmentSubmission(Base):
    """
    One candidate's participation in an assignment. Created at invite time with
    a unique access token (the candidate opens /assignment/{token} — no login
    required, mirroring Application.status_token). Tracks the transcript bundle
    through the analysis pipeline.

    Status machine: invited → submitted → processing → analyzed | failed
    (failed submissions can be retried back into processing).
    """
    __tablename__ = "assignment_submissions"

    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), nullable=True, index=True)

    candidate_name = Column(String(255), nullable=False)
    candidate_email = Column(String(255), nullable=False)
    access_token = Column(String(64), unique=True, index=True, nullable=False)

    status = Column(String(20), default="invited", nullable=False, index=True)
    error = Column(Text, nullable=True)                # last pipeline failure (visible to recruiter)
    attempts = Column(Integer, default=0, nullable=False)

    # S3 keys of the scrubbed transcript files, JSON list. Raw uploads are
    # scrubbed server-side BEFORE storage — secrets never persist.
    transcript_file_keys = Column(Text, nullable=True)
    transcript_bytes = Column(Integer, nullable=True)  # total stored size
    session_count = Column(Integer, nullable=True)
    repo_url = Column(String(500), nullable=True)      # candidate-provided repo link (optional)
    # JSON git snapshot captured by the submit CLI (commit count, first/last commit
    # times, recent subjects, file count). Absent for web uploads. Used for the
    # git↔transcript integrity correlation. Never contains file contents.
    git_metadata = Column(Text, nullable=True)
    submit_source = Column(String(20), default="web", nullable=False)  # web | cli

    invited_at = Column(DateTime, server_default=func.now())
    submitted_at = Column(DateTime, nullable=True)
    analyzed_at = Column(DateTime, nullable=True)

    # Claude Code MCP companion (routers/mcp_candidate.py) — set when the candidate connects
    # their own Claude Code using this row's access_token. mcp_connected_at is the FIRST
    # successful handshake; mcp_last_seen_at is bumped on every subsequent MCP tool call.
    # Neither implies "actively working right now" — `claude mcp list`/`get` can themselves
    # trigger a handshake.
    mcp_connected_at = Column(DateTime, nullable=True)
    mcp_last_seen_at = Column(DateTime, nullable=True)

    assignment = relationship("Assignment", back_populates="submissions")
    application = relationship("Application", foreign_keys=[application_id])
    report = relationship("FluencyReport", back_populates="submission", uselist=False)


class FluencyReport(Base):
    """
    The scored output of the analysis pipeline for one submission.
    Dimension scores / evidence / metrics are JSON text columns (same convention
    as Job.jd_requirements) so the report schema can evolve without migrations.
    """
    __tablename__ = "fluency_reports"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("assignment_submissions.id"),
                           nullable=False, unique=True, index=True)

    overall_score = Column(Float, nullable=False)       # 0-100
    summary = Column(Text, nullable=True)               # recruiter-facing narrative
    dimensions = Column(Text, nullable=False)           # JSON: [{key, label, score, confidence, note, evidence[]}]
    highlights = Column(Text, nullable=True)            # JSON: {best_moment, growth_area}
    metrics = Column(Text, nullable=True)               # JSON: deterministic transcript metrics
    integrity_flags = Column(Text, nullable=True)       # JSON: [{code, detail, severity}]
    integrity_confidence = Column(String(20), nullable=True)  # high|medium|low

    provider = Column(String(20), nullable=True)        # which AI provider judged it
    chunk_model = Column(String(100), nullable=True)
    aggregate_model = Column(String(100), nullable=True)
    input_tokens_est = Column(Integer, nullable=True)   # effective tokens fed to the judge

    created_at = Column(DateTime, server_default=func.now())

    submission = relationship("AssignmentSubmission", back_populates="report")


class RecruiterMcpApiKey(Base):
    """
    A long-lived, revocable bearer credential a recruiter generates from their account
    settings to connect THEIR OWN Claude Code to the recruiter-only MCP server
    (/mcp-recruiter). Deliberately NOT the recruiter's JWT — JWTs are short-lived
    session tokens, the wrong shape for a static CLI bearer header.
    """
    __tablename__ = "recruiter_mcp_api_keys"

    id = Column(Integer, primary_key=True, index=True)
    recruiter_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    key = Column(String(64), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    last_used_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)  # non-null => key rejected on every auth check

    recruiter = relationship("User", foreign_keys=[recruiter_id])


class VoiceSession(Base):
    """
    Usage log for the recruiter Voice Copilot (OpenAI Realtime API, browser-direct
    WebRTC — see services/voice_session.py). NOT a billing/entitlement layer, just
    cost visibility: one row per minted ephemeral client secret. `ended_at` is
    client-reported on cleanup and best-effort only (a tab close can't guarantee
    delivery) — the real per-session cost cap is the `expires_after` bound set on
    the OpenAI session itself at mint time, not this row.
    """
    __tablename__ = "voice_sessions"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("assignment_submissions.id"), nullable=False, index=True)
    recruiter_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    minted_at = Column(DateTime, server_default=func.now())
    client_secret_expires_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
