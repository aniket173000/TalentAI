from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./talentai.db"
    OPENAI_API_KEY: str = ""
    MAX_APPLICATIONS_PER_JOB: int = 10
    MIN_MATCH_SCORE: float = 80.0

    # ── JWT auth ──────────────────────────────────────────────────────────────
    JWT_SECRET: str = "change-me-to-a-long-random-string-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24 h

    # ── AI provider (Strategy pattern) ───────────────────────────────────────
    # Supported values: "openai" | "claude" (stub)
    AI_PROVIDER: str = "openai"
    AI_MODEL: str = "gpt-4o"
    EMBEDDING_MODEL: str = "text-embedding-3-small"

    # ── Email ─────────────────────────────────────────────────────────────────
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    FROM_EMAIL: str = ""

    FRONTEND_URL: str = "http://localhost:5173"

    # ── LinkedIn OAuth ────────────────────────────────────────────────────────
    LINKEDIN_CLIENT_ID: str = ""
    LINKEDIN_CLIENT_SECRET: str = ""
    LINKEDIN_REDIRECT_URI: str = "http://localhost:8000/api/auth/linkedin/callback"

    # ── AWS S3 (resume file storage) ─────────────────────────────────────────
    # Leave blank to run without S3 — text-only fallback will be used.
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "us-east-1"
    S3_BUCKET: str = ""
    # Pre-signed URL expiry in seconds (default 15 min)
    S3_PRESIGN_EXPIRY: int = 900

    class Config:
        env_file = ".env"


settings = Settings()
