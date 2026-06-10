from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Float, Text, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("email", "role", name="uq_user_email_role"),)

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(String(50), default="candidate")  # "recruiter" | "candidate"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    totp_secret = Column(String(255), nullable=True)
    totp_enabled = Column(Boolean, default=False)

    applications = relationship("Application", back_populates="user")


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
    status = Column(String(50), default="accepted")  # accepted | rejected | displaced

    strengths = Column(Text)
    gaps = Column(Text)
    improvement_suggestions = Column(Text)
    project_scores = Column(Text, nullable=True)
    resume_embedding = Column(Text, nullable=True)

    applied_at = Column(DateTime, server_default=func.now())

    job = relationship("Job", back_populates="applications")
    user = relationship("User", back_populates="applications")
