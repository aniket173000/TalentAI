from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


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

    applications = relationship("Application", back_populates="job")


class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)

    candidate_name = Column(String(255), nullable=False)
    candidate_email = Column(String(255), nullable=False)
    resume_text = Column(Text, nullable=False)
    resume_filename = Column(String(255))

    match_score = Column(Float, nullable=False)
    rank = Column(Integer, nullable=True)
    # accepted | rejected | displaced
    status = Column(String(50), default="accepted")

    strengths = Column(Text)               # JSON array string
    gaps = Column(Text)                    # JSON array string
    improvement_suggestions = Column(Text) # JSON array string

    applied_at = Column(DateTime, server_default=func.now())

    job = relationship("Job", back_populates="applications")
