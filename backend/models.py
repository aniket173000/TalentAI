from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Float, Text, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("email", "role", name="uq_user_email_role"),)

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), index=True, nullable=False)
    hashed_password = Column(String(255), nullable=True)   # nullable for LinkedIn-only accounts
    full_name = Column(String(255), nullable=False)
    role = Column(String(50), default="candidate")  # "recruiter" | "candidate"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    totp_secret = Column(String(255), nullable=True)
    totp_enabled = Column(Boolean, default=False)

    # LinkedIn OAuth fields
    linkedin_id = Column(String(255), nullable=True)
    linkedin_verified = Column(Boolean, default=False)
    # Recruiter's current employer — used for company verification on job posts
    company = Column(String(255), nullable=True)
    is_third_party_recruiter = Column(Boolean, default=False)

    # Magic Match — candidate job recommendations
    profile_embedding = Column(Text, nullable=True)      # cached embedding of latest resume
    magic_match_date = Column(String(10), nullable=True)  # ISO date of last magic match call (rate-limit)
    magic_match_cache = Column(Text, nullable=True)       # JSON of last magic match results for today

    # Personal profile
    phone = Column(String(50), nullable=True)

    # Candidate's profile resume (independent of any specific job application)
    resume_text = Column(Text, nullable=True)
    resume_filename = Column(String(255), nullable=True)

    # Candidate career insights (AI-generated from latest resume)
    career_profile = Column(Text, nullable=True)              # JSON blob — see CareerProfile schema
    career_profile_updated_at = Column(DateTime, nullable=True)

    applications = relationship("Application", back_populates="user")
    resumes = relationship("UserResume", back_populates="user", order_by="desc(UserResume.uploaded_at)")


class UserResume(Base):
    __tablename__ = "user_resumes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    resume_text = Column(Text, nullable=False)
    is_primary = Column(Boolean, default=False)
    uploaded_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="resumes")


class EligibilityCriteria(Base):
    __tablename__ = "eligibility_criteria"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), unique=True, nullable=False)
    min_years_experience = Column(Integer, nullable=True)
    required_skills = Column(Text, nullable=True)       # JSON array of strings
    required_education = Column(String(50), nullable=True)  # None/Diploma/Bachelor/Master/PhD

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

    # PRD additions
    status = Column(String(50), default="draft")        # draft | published | closed
    slug = Column(String(255), unique=True, index=True, nullable=True)
    department = Column(String(255), nullable=True)
    employment_type = Column(String(100), nullable=True)  # Full-time/Part-time/Contract/Internship
    salary_range_min = Column(Integer, nullable=True)
    salary_range_max = Column(Integer, nullable=True)
    remote_policy = Column(String(100), nullable=True)    # On-site/Remote/Hybrid
    application_deadline = Column(DateTime, nullable=True)
    published_at = Column(DateTime, nullable=True)
    company_url = Column(String(500), nullable=True)      # company website or LinkedIn URL
    company_logo_url = Column(String(1000), nullable=True) # resolved logo URL (auto-populated)
    is_third_party = Column(Boolean, default=False)         # posted by a third-party recruiter

    applications = relationship("Application", back_populates="job")
    recruiter = relationship("User", foreign_keys=[recruiter_id])
    criteria = relationship("EligibilityCriteria", back_populates="job", uselist=False)
    audit_logs = relationship("JobAuditLog", order_by="desc(JobAuditLog.changed_at)")


class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    candidate_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    candidate_name = Column(String(255), nullable=False)
    candidate_email = Column(String(255), nullable=False)
    resume_text = Column(Text, nullable=False)
    resume_filename = Column(String(255))

    match_score = Column(Float, nullable=False)
    rank = Column(Integer, nullable=True)
    status = Column(String(50), default="accepted")  # accepted | rejected | displaced (pool-management)
    # candidate_status: what the candidate sees
    #   AI-set:       rejected | pool_accepted
    #   Recruiter-set: under_review | interview_scheduled | offer_extended | interview_rejected
    candidate_status = Column(String(50), default="rejected")
    status_token = Column(String(64), nullable=True, unique=True, index=True)  # public tracking URL token
    status_feedback = Column(Text, nullable=True)  # recruiter feedback for interview_rejected

    strengths = Column(Text)
    gaps = Column(Text)
    improvement_suggestions = Column(Text)
    project_scores = Column(Text, nullable=True)
    resume_embedding = Column(Text, nullable=True)

    applied_at = Column(DateTime, server_default=func.now())

    job = relationship("Job", back_populates="applications")
    user = relationship("User", back_populates="applications")
