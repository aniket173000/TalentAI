from pydantic import BaseModel, EmailStr
from typing import Literal, Optional, List
from datetime import datetime


# ── Auth ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: Literal["recruiter", "candidate"] = "candidate"


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    created_at: datetime

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ── Jobs ──────────────────────────────────────────────────────────────────────

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


# ── Applications ──────────────────────────────────────────────────────────────

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
    project_scores: Optional[str] = None
    applied_at: datetime

    class Config:
        from_attributes = True
