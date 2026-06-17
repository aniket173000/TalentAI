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
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # LinkedIn OAuth
    linkedin_id = Column(String(255), nullable=True, index=True)
    linkedin_verified = Column(Boolean, default=False)

    # Two-factor authentication
    totp_secret = Column(String(255), nullable=True)
    totp_enabled = Column(Boolean, default=False)

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
    current_company = Column(String(255), nullable=True)    # alumni: current employer

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
    resume_embedding = Column(Text, nullable=True)
    resume_file_key = Column(String(500), nullable=True)
    match_score = Column(Float, nullable=False)
    rank = Column(Integer, nullable=True)
    status = Column(String(50), default="pending")
    candidate_status = Column(String(50), default="received")
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
