from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Float, Text, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(String(50), default="candidate")  # "recruiter" | "candidate"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    # 2FA scaffolding — not active yet, kept for future wiring
    totp_secret = Column(String(255), nullable=True)
    totp_enabled = Column(Boolean, default=False)

    applications = relationship("Application", back_populates="user")


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
    jd_embedding = Column(Text, nullable=True)  # JSON float array (text-embedding-3-small)
    recruiter_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    applications = relationship("Application", back_populates="job")
    recruiter = relationship("User", foreign_keys=[recruiter_id])


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

    strengths = Column(Text)                 # JSON array
    gaps = Column(Text)                      # JSON array
    improvement_suggestions = Column(Text)   # JSON array
    project_scores = Column(Text, nullable=True)    # JSON array of per-project analysis
    resume_embedding = Column(Text, nullable=True)  # JSON float array for vector comparison

    applied_at = Column(DateTime, server_default=func.now())

    job = relationship("Job", back_populates="applications")
    user = relationship("User", back_populates="applications")
