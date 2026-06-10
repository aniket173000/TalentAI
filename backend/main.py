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
]

with engine.connect() as _conn:
    for _sql in _MIGRATIONS:
        try:
            _conn.execute(text(_sql))
            _conn.commit()
        except Exception:
            pass  # column/index already exists


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
app.include_router(jobs.router)
app.include_router(applications.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "TalentAI API v2"}
