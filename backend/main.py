import logging
import re

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

import models
from config import settings
from database import SessionLocal, engine
from routers import applications, jobs
from routers import auth as auth_router
from routers import colleges as colleges_router
from routers import linkedin_auth as linkedin_auth_router
from routers import profile as profile_router
from routers import resume_profile as resume_profile_router
from routers import scores as scores_router
from routers import semantic as semantic_router

logging.basicConfig(level=logging.INFO)

# Create all tables (new tables created automatically)
models.Base.metadata.create_all(bind=engine)

# Migrate existing tables — add columns that didn't exist before.
# SQLite has no IF NOT EXISTS for ADD COLUMN; we catch the error silently.
_MIGRATIONS = [
    "ALTER TABLE jobs ADD COLUMN jd_embedding TEXT",
    "ALTER TABLE jobs ADD COLUMN recruiter_id INTEGER REFERENCES users(id)",
    "ALTER TABLE applications ADD COLUMN candidate_user_id INTEGER REFERENCES users(id)",
    "ALTER TABLE applications ADD COLUMN resume_embedding TEXT",
    "ALTER TABLE applications ADD COLUMN project_scores TEXT",
    # Per-role email uniqueness
    "DROP INDEX IF EXISTS ix_users_email",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_user_email_role ON users (email, role)",
    # Job PRD fields
    "ALTER TABLE jobs ADD COLUMN status VARCHAR(50) DEFAULT 'draft'",
    "ALTER TABLE jobs ADD COLUMN slug VARCHAR(255)",
    "ALTER TABLE jobs ADD COLUMN department VARCHAR(255)",
    "ALTER TABLE jobs ADD COLUMN employment_type VARCHAR(100)",
    "ALTER TABLE jobs ADD COLUMN salary_range_min INTEGER",
    "ALTER TABLE jobs ADD COLUMN salary_range_max INTEGER",
    "ALTER TABLE jobs ADD COLUMN remote_policy VARCHAR(100)",
    "ALTER TABLE jobs ADD COLUMN application_deadline DATETIME",
    "ALTER TABLE jobs ADD COLUMN published_at DATETIME",
    "CREATE UNIQUE INDEX IF NOT EXISTS ix_jobs_slug ON jobs (slug)",
    # Company profile
    "ALTER TABLE jobs ADD COLUMN company_url VARCHAR(500)",
    "ALTER TABLE jobs ADD COLUMN company_logo_url VARCHAR(1000)",
    # Candidate application status tracking
    "ALTER TABLE applications ADD COLUMN candidate_status VARCHAR(50) DEFAULT 'received'",
    "ALTER TABLE applications ADD COLUMN status_token VARCHAR(64)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ix_applications_status_token ON applications (status_token)",
    # LinkedIn OAuth + company verification
    "ALTER TABLE users ADD COLUMN linkedin_id VARCHAR(255)",
    "ALTER TABLE users ADD COLUMN linkedin_verified BOOLEAN DEFAULT 0",
    "ALTER TABLE users ADD COLUMN company VARCHAR(255)",
    "ALTER TABLE users ADD COLUMN is_third_party_recruiter BOOLEAN DEFAULT 0",
    "ALTER TABLE jobs ADD COLUMN is_third_party BOOLEAN DEFAULT 0",
    # Recruiter feedback for interview_rejected status
    "ALTER TABLE applications ADD COLUMN status_feedback TEXT",
    # Magic Match — candidate job recommendation system
    "ALTER TABLE users ADD COLUMN profile_embedding TEXT",
    "ALTER TABLE users ADD COLUMN magic_match_date VARCHAR(10)",
    "ALTER TABLE users ADD COLUMN magic_match_cache TEXT",
    # Personal profile
    "ALTER TABLE users ADD COLUMN phone VARCHAR(50)",
    "ALTER TABLE users ADD COLUMN resume_text TEXT",
    "ALTER TABLE users ADD COLUMN resume_filename VARCHAR(255)",
    # Candidate career insights
    "ALTER TABLE users ADD COLUMN career_profile TEXT",
    "ALTER TABLE users ADD COLUMN career_profile_updated_at DATETIME",
    # Resume vault — up to 3 saved resumes per candidate
    "CREATE TABLE IF NOT EXISTS user_resumes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), filename VARCHAR(255) NOT NULL, resume_text TEXT NOT NULL, is_primary BOOLEAN DEFAULT 0, uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    # S3 original file keys
    "ALTER TABLE applications ADD COLUMN resume_file_key VARCHAR(500)",
    "ALTER TABLE user_resumes ADD COLUMN file_key VARCHAR(500)",
    # JD Parsing — structured requirements extracted by AI (E5-S1)
    "ALTER TABLE jobs ADD COLUMN jd_requirements TEXT",
    "ALTER TABLE jobs ADD COLUMN jd_parse_status VARCHAR(20)",
    "ALTER TABLE jobs ADD COLUMN jd_parse_error TEXT",
    # Structured resume extraction (CandidateProfile + SkillReviewQueue)
    "CREATE TABLE IF NOT EXISTS candidate_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id), application_id INTEGER REFERENCES applications(id), source_resume_hash VARCHAR(64), full_name VARCHAR(255), email VARCHAR(255), phone VARCHAR(100), location VARCHAR(255), total_yoe REAL, work_history TEXT, raw_skills TEXT, normalized_skills TEXT, unmapped_skills TEXT, education TEXT, projects TEXT, certifications TEXT, confidence_scores TEXT, taxonomy_version VARCHAR(50), extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "CREATE INDEX IF NOT EXISTS ix_candidate_profiles_user_id ON candidate_profiles (user_id)",
    "CREATE INDEX IF NOT EXISTS ix_candidate_profiles_resume_hash ON candidate_profiles (source_resume_hash)",
    "CREATE TABLE IF NOT EXISTS skill_review_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, skill_name VARCHAR(255) NOT NULL UNIQUE, occurrence_count INTEGER NOT NULL DEFAULT 1, first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    # Composite suitability scores — E5-S6
    "CREATE TABLE IF NOT EXISTS candidate_job_scores (id INTEGER PRIMARY KEY AUTOINCREMENT, application_id INTEGER NOT NULL REFERENCES applications(id), job_id INTEGER NOT NULL REFERENCES jobs(id), candidate_profile_id INTEGER REFERENCES candidate_profiles(id), model_version VARCHAR(20) NOT NULL, skills_score REAL, experience_score REAL, education_score REAL, projects_score REAL, composite_score REAL NOT NULL, breakdown TEXT, inputs_hash VARCHAR(64) NOT NULL, scored_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "CREATE INDEX IF NOT EXISTS ix_candidate_job_scores_app_job ON candidate_job_scores (application_id, job_id)",
    "CREATE INDEX IF NOT EXISTS ix_candidate_job_scores_inputs_hash ON candidate_job_scores (inputs_hash)",
    # College / university info for candidates
    "ALTER TABLE users ADD COLUMN college_name VARCHAR(500)",
    "ALTER TABLE users ADD COLUMN graduation_year INTEGER",
    "ALTER TABLE users ADD COLUMN is_graduated BOOLEAN",
    "ALTER TABLE users ADD COLUMN college_logo_url VARCHAR(1000)",
    "ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN DEFAULT 0",
    "CREATE INDEX IF NOT EXISTS ix_users_college_name ON users (college_name)",
    # Candidate public profile fields
    "ALTER TABLE users ADD COLUMN candidate_linkedin_url VARCHAR(500)",
    "ALTER TABLE users ADD COLUMN current_company VARCHAR(255)",
    # College directory table (one row per college, populated by first candidate + AI)
    "CREATE TABLE IF NOT EXISTS colleges (id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR(500) NOT NULL UNIQUE, short_name VARCHAR(20), logo_url VARCHAR(1000), website_url VARCHAR(500), ai_info TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "CREATE INDEX IF NOT EXISTS ix_colleges_name ON colleges (name)",
    # Campus hiring — job targeted at a specific college
    "ALTER TABLE jobs ADD COLUMN is_campus_hiring BOOLEAN DEFAULT 0",
    "ALTER TABLE jobs ADD COLUMN campus_college_name VARCHAR(500)",
]

with engine.connect() as _conn:
    for _sql in _MIGRATIONS:
        try:
            _conn.execute(text(_sql))
            _conn.commit()
        except Exception:
            pass  # column/index already exists


# Data migration: remap old candidate_status values to new state machine
with engine.connect() as _conn:
    try:
        _conn.execute(text(
            "UPDATE applications SET candidate_status = 'pool_accepted' "
            "WHERE candidate_status IN ('shortlisted', 'received') AND status = 'accepted'"
        ))
        _conn.execute(text(
            "UPDATE applications SET candidate_status = 'rejected' "
            "WHERE candidate_status = 'received' AND status != 'accepted'"
        ))
        _conn.commit()
    except Exception:
        pass


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    return re.sub(r"-+", "-", text).strip("-")


# Backfill: existing jobs get status=published + auto slug
with SessionLocal() as _s:
    for _job in _s.query(models.Job).all():
        if not _job.status:
            _job.status = "published"
        if not _job.slug:
            base = _slugify(f"{_job.title}-{_job.location or 'remote'}")
            slug, n = base, 2
            while _s.query(models.Job).filter(
                models.Job.slug == slug, models.Job.id != _job.id
            ).first():
                slug, n = f"{base}-{n}", n + 1
            _job.slug = slug
    _s.commit()

app = FastAPI(
    title="TalentAI",
    description="AI-Powered Recruitment Intelligence Platform",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(linkedin_auth_router.router)
app.include_router(jobs.router)
app.include_router(applications.router)
app.include_router(profile_router.router)
app.include_router(resume_profile_router.router)
app.include_router(semantic_router.router)
app.include_router(scores_router.router)
app.include_router(colleges_router.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "TalentAI API v2"}
