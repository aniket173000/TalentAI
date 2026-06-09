from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class JobCreate(BaseModel):
    title: str
    jd_text: str
    company: str = "Our Company"
    location: str = "Remote"
    max_count: int = 10


class JobResponse(BaseModel):
    id: int
    title: str
    jd_text: str
    company: str
    location: str
    max_count: int
    min_match_score: float
    created_at: datetime
    active_applications: int = 0

    class Config:
        from_attributes = True


class ApplicationResponse(BaseModel):
    id: int
    job_id: int
    candidate_name: str
    candidate_email: str
    match_score: float
    rank: Optional[int]
    status: str
    strengths: Optional[str]
    gaps: Optional[str]
    improvement_suggestions: Optional[str]
    applied_at: datetime

    class Config:
        from_attributes = True
