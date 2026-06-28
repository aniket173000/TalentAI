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
from routers import candidates as candidates_router
from routers import feedback as feedback_router
from routers import search as search_router
from routers import colleges as colleges_router
from routers import linkedin_auth as linkedin_auth_router
from routers import google_auth as google_auth_router
from routers import profile as profile_router
from routers import referrals as referrals_router
from routers import resume_profile as resume_profile_router
from routers import scores as scores_router
from routers import semantic as semantic_router
from routers import product_feedback as product_feedback_router

logging.basicConfig(level=logging.INFO)

_IS_SQLITE = settings.DATABASE_URL.startswith("sqlite")
_IS_POSTGRES = settings.DATABASE_URL.startswith("postgres")

# pgvector must exist before create_all() builds any Vector columns.
if _IS_POSTGRES:
    with engine.connect() as _conn:
        _conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        _conn.commit()

# Create all tables (new tables created automatically)
models.Base.metadata.create_all(bind=engine)

# Postgres-only: add pgvector columns + HNSW indexes as an optimisation layer.
# The TEXT embedding columns remain the portable source of truth; these vector
# columns are kept in sync (backfill_vectors.py + ingest) and power ANN retrieval.
if _IS_POSTGRES:
    _PG_VECTOR_DDL = [
        "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS profile_vec vector(1536)",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS jd_vec vector(1536)",
        # Platform-candidate support: link to source user, ownership optional.
        "ALTER TABLE candidates ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)",
        "ALTER TABLE candidates ALTER COLUMN recruiter_id DROP NOT NULL",
        "CREATE INDEX IF NOT EXISTS ix_candidates_user_id ON candidates (user_id)",
        "CREATE INDEX IF NOT EXISTS ix_candidates_profile_vec "
        "ON candidates USING hnsw (profile_vec vector_cosine_ops)",
        "CREATE INDEX IF NOT EXISTS ix_jobs_jd_vec "
        "ON jobs USING hnsw (jd_vec vector_cosine_ops)",
    ]
    with engine.connect() as _conn:
        for _sql in _PG_VECTOR_DDL:
            try:
                _conn.execute(text(_sql))
                _conn.commit()
            except Exception:
                _conn.rollback()

# Migrate existing tables — add columns that didn't exist before.
# SQLite has no IF NOT EXISTS for ADD COLUMN; we catch the error silently.
_MIGRATIONS = [
    "ALTER TABLE jobs ADD COLUMN jd_embedding TEXT",
    "ALTER TABLE jobs ADD COLUMN recruiter_id INTEGER REFERENCES users(id)",
    "ALTER TABLE applications ADD COLUMN candidate_user_id INTEGER REFERENCES users(id)",
    "ALTER TABLE applications ADD COLUMN resume_embedding TEXT",
    "ALTER TABLE applications ADD COLUMN project_scores TEXT",
    # Unified identity — drop the old per-role compound index, enforce email uniqueness
    "DROP INDEX IF EXISTS uq_user_email_role",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON users (email)",
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
    # Google OAuth
    "ALTER TABLE users ADD COLUMN google_id VARCHAR(255)",
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
    # ── Referral feature ──────────────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS email_verification_otps (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), work_email VARCHAR(255) NOT NULL, otp_hash VARCHAR(64) NOT NULL, expires_at DATETIME NOT NULL, used BOOLEAN DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "CREATE INDEX IF NOT EXISTS ix_email_verification_otps_user_id ON email_verification_otps (user_id)",
    "CREATE TABLE IF NOT EXISTS referral_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, slug VARCHAR(255) UNIQUE, referrer_user_id INTEGER NOT NULL REFERENCES users(id), company_name VARCHAR(255) NOT NULL, company_verified BOOLEAN DEFAULT 0, verification_method VARCHAR(20), work_email_domain VARCHAR(255), link_type VARCHAR(20) DEFAULT 'internal', job_id INTEGER REFERENCES jobs(id), external_job_url VARCHAR(500), jd_raw TEXT, jd_requirements TEXT, title VARCHAR(255) NOT NULL, location VARCHAR(255), employment_type VARCHAR(100), min_match_score REAL DEFAULT 40.0, pool_size INTEGER DEFAULT 15, waitlist_size INTEGER DEFAULT 10, status VARCHAR(30) DEFAULT 'draft', opens_at DATETIME, closes_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
    "CREATE INDEX IF NOT EXISTS ix_referral_posts_referrer_user_id ON referral_posts (referrer_user_id)",
    "CREATE INDEX IF NOT EXISTS ix_referral_posts_slug ON referral_posts (slug)",
    "CREATE TABLE IF NOT EXISTS referral_applications (id INTEGER PRIMARY KEY AUTOINCREMENT, referral_post_id INTEGER NOT NULL REFERENCES referral_posts(id), candidate_user_id INTEGER NOT NULL REFERENCES users(id), resume_text TEXT NOT NULL, match_score REAL NOT NULL, rank INTEGER, pool_type VARCHAR(20) DEFAULT 'pool', status VARCHAR(30) DEFAULT 'in_pool', applied_at DATETIME DEFAULT CURRENT_TIMESTAMP, displaced_at DATETIME, referred_at DATETIME)",
    "CREATE INDEX IF NOT EXISTS ix_referral_applications_post_candidate ON referral_applications (referral_post_id, candidate_user_id)",
    "CREATE INDEX IF NOT EXISTS ix_referral_applications_candidate_user_id ON referral_applications (candidate_user_id)",

    # ── Unified user profile — extension tables (replaces role column) ─────────
    # CandidateExtension: existence = user has candidate capability
    """CREATE TABLE IF NOT EXISTS candidate_extensions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
        onboarding_completed BOOLEAN DEFAULT 0,
        candidate_linkedin_url VARCHAR(500),
        current_company VARCHAR(255),
        resume_text TEXT,
        resume_filename VARCHAR(255),
        career_profile TEXT,
        career_profile_updated_at DATETIME,
        profile_embedding TEXT,
        magic_match_date VARCHAR(10),
        magic_match_cache TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )""",
    "CREATE INDEX IF NOT EXISTS ix_candidate_extensions_user_id ON candidate_extensions (user_id)",

    # RecruiterExtension: existence = user has recruiter capability
    """CREATE TABLE IF NOT EXISTS recruiter_extensions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
        company VARCHAR(255),
        is_third_party BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )""",
    "CREATE INDEX IF NOT EXISTS ix_recruiter_extensions_user_id ON recruiter_extensions (user_id)",

    # UserEducation: normalised education history (one-to-many per user)
    """CREATE TABLE IF NOT EXISTS user_education (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        college_id INTEGER REFERENCES colleges(id),
        institution_name VARCHAR(500) NOT NULL,
        degree_type VARCHAR(100),
        field_of_study VARCHAR(255),
        graduation_year INTEGER,
        is_graduated BOOLEAN,
        is_primary BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )""",
    "CREATE INDEX IF NOT EXISTS ix_user_education_user_id ON user_education (user_id)",
    "CREATE INDEX IF NOT EXISTS ix_user_education_institution ON user_education (institution_name)",

    # users table: add updated_at column (new schema addition)
    "ALTER TABLE users ADD COLUMN updated_at DATETIME",

    # Application resume filename (was missing from original schema)
    "ALTER TABLE applications ADD COLUMN resume_filename VARCHAR(255)",

    # ── Profile enrichment ────────────────────────────────────────────────────
    "ALTER TABLE users ADD COLUMN headline VARCHAR(255)",
    "ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500)",

    # ── Work experience ───────────────────────────────────────────────────────
    """CREATE TABLE IF NOT EXISTS work_experiences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        company VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        location VARCHAR(255),
        start_month INTEGER,
        start_year INTEGER NOT NULL,
        end_month INTEGER,
        end_year INTEGER,
        is_current BOOLEAN DEFAULT 0,
        description TEXT,
        order_index INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )""",
    "CREATE INDEX IF NOT EXISTS ix_work_experiences_user_id ON work_experiences (user_id)",

    # ── Job compensation currency ─────────────────────────────────────────────
    "ALTER TABLE jobs ADD COLUMN salary_currency VARCHAR(8)",

    # ── Referral: referrer presentation fields ────────────────────────────────
    "ALTER TABLE referral_posts ADD COLUMN referrer_title VARCHAR(255)",
    "ALTER TABLE referral_posts ADD COLUMN referrer_tenure VARCHAR(100)",
    "ALTER TABLE referral_posts ADD COLUMN referrer_note TEXT",

    # ── Ranking: AI Fluency factor ────────────────────────────────────────────
    "ALTER TABLE candidate_rankings ADD COLUMN ai_fluency_score FLOAT",
    "ALTER TABLE candidate_rankings ADD COLUMN ai_fluency_note TEXT",
]

# These are legacy SQLite-era patches. On a fresh Postgres database every table
# and column already exists (built by create_all from models.py), so each
# statement fails harmlessly — we roll back so the aborted transaction does not
# poison the next statement (Postgres) and skip on.
with engine.connect() as _conn:
    for _sql in _MIGRATIONS:
        try:
            _conn.execute(text(_sql))
            _conn.commit()
        except Exception:
            _conn.rollback()  # column/index/table already exists


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
        _conn.rollback()


# Data migration: seed extension tables from legacy role column (idempotent).
# For users that already have extension rows this is a no-op (INSERT OR IGNORE).
# For duplicate-email users (same email, role='candidate' AND role='recruiter'),
# we pick the lower id as the canonical row and attach both extensions to it.
with engine.connect() as _conn:
    try:
        # 1. Seed candidate_extensions from users where role = 'candidate'
        _conn.execute(text("""
            INSERT OR IGNORE INTO candidate_extensions
                (user_id, onboarding_completed, candidate_linkedin_url, current_company,
                 resume_text, resume_filename, career_profile, career_profile_updated_at,
                 profile_embedding, magic_match_date, magic_match_cache)
            SELECT
                id,
                COALESCE(onboarding_completed, 0),
                candidate_linkedin_url,
                current_company,
                resume_text,
                resume_filename,
                career_profile,
                career_profile_updated_at,
                profile_embedding,
                magic_match_date,
                magic_match_cache
            FROM users
            WHERE role = 'candidate'
        """))
        _conn.commit()
    except Exception:
        _conn.rollback()

    try:
        # 2. Seed recruiter_extensions from users where role = 'recruiter'
        _conn.execute(text("""
            INSERT OR IGNORE INTO recruiter_extensions (user_id, company, is_third_party)
            SELECT id, company, COALESCE(is_third_party_recruiter, 0)
            FROM users
            WHERE role = 'recruiter'
        """))
        _conn.commit()
    except Exception:
        _conn.rollback()

    try:
        # 3. Seed user_education from users where college_name IS NOT NULL
        _conn.execute(text("""
            INSERT OR IGNORE INTO user_education
                (user_id, institution_name, graduation_year, is_graduated, is_primary)
            SELECT id, college_name, graduation_year, is_graduated, 1
            FROM users
            WHERE college_name IS NOT NULL AND college_name != ''
              AND role = 'candidate'
              AND id NOT IN (SELECT user_id FROM user_education)
        """))
        _conn.commit()
    except Exception:
        _conn.rollback()

    try:
        # 4. For each email that has BOTH a candidate and recruiter row (dual-role),
        #    attach the recruiter extension to the candidate's user_id (lower id wins)
        #    so both capabilities live on one account.
        _conn.execute(text("""
            INSERT OR IGNORE INTO recruiter_extensions (user_id, company, is_third_party)
            SELECT
                c.id AS canonical_id,
                r.company,
                COALESCE(r.is_third_party_recruiter, 0)
            FROM users c
            JOIN users r ON c.email = r.email AND c.id < r.id
            WHERE c.role = 'candidate' AND r.role = 'recruiter'
              AND c.id NOT IN (SELECT user_id FROM recruiter_extensions)
        """))
        _conn.commit()
    except Exception:
        _conn.rollback()


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
    title="Nideknil",
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
app.include_router(google_auth_router.router)
app.include_router(jobs.router)
app.include_router(applications.router)
app.include_router(candidates_router.router)
app.include_router(search_router.router)
app.include_router(feedback_router.router)
app.include_router(profile_router.router)
app.include_router(resume_profile_router.router)
app.include_router(semantic_router.router)
app.include_router(scores_router.router)
app.include_router(colleges_router.router)
app.include_router(referrals_router.router)
app.include_router(product_feedback_router.router)


@app.on_event("startup")
def _warm_reranker():
    # Warm the cross-encoder so the first rank skips the ~25s model load.
    # In Celery mode the funnel runs in the worker (which warms its own copy),
    # so the API process skips this to avoid loading torch it won't use.
    if settings.USE_CELERY:
        return
    import threading

    from services.reranker import warm
    threading.Thread(target=warm, daemon=True).start()


@app.get("/health")
def health():
    return {"status": "ok", "service": "Nideknil API v2"}
