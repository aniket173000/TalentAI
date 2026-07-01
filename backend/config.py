from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./talentai.db"
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    MAX_APPLICATIONS_PER_JOB: int = 10
    MIN_MATCH_SCORE: float = 80.0
    # Reserve ("runner-up") pool: how many top non-accepted candidates keep their
    # full data and stay visible to the recruiter. Everyone below this is archived
    # (heavy data pruned; only a tombstone remains to block re-application).
    RESERVE_POOL_SIZE: int = 15

    # ── Admin panel access ────────────────────────────────────────────────────
    # Comma-separated emails allowed into /admin. Gmail "+alias" and dots are
    # normalised, so one address covers all your test aliases.
    ADMIN_EMAILS: str = "aniket.s@aspireapp.com,aniketshrivastav02@gmail.com"

    # ── JWT auth ──────────────────────────────────────────────────────────────
    JWT_SECRET: str = "change-me-to-a-long-random-string-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24 h

    # ── Ranking funnel task queue (Celery + Redis) ───────────────────────────
    # When USE_CELERY is true, the ranking funnel is dispatched to a Celery
    # worker. When false (default), it runs in an in-process daemon thread —
    # fine for local dev/tests without a worker.
    USE_CELERY: bool = False
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    # ── AI provider (Strategy pattern) ───────────────────────────────────────
    # Supported values: "openai" | "claude" (stub)
    AI_PROVIDER: str = "openai"
    AI_MODEL: str = "gpt-4o"
    EMBEDDING_MODEL: str = "text-embedding-3-small"

    # ── Rerank stage (funnel stage 2) ────────────────────────────────────────
    # Hosted Cohere Rerank replaces the local bge cross-encoder so no torch is
    # loaded on memory-constrained hosts. Get a key at https://dashboard.cohere.com
    COHERE_API_KEY: str = ""
    RERANK_MODEL: str = "rerank-v3.5"

    # ── Email ─────────────────────────────────────────────────────────────────
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    FROM_EMAIL: str = ""

    FRONTEND_URL: str = "http://localhost:5173"

    # ── Brand / logo resolution ──────────────────────────────────────────────
    # Optional. When set, Brandfetch is used first (highest-quality logos +
    # brand page). Without it, the resolver falls back to keyless providers
    # (Clearbit autocomplete for companies, Hipolabs for universities).
    # Get a free client id at https://developers.brandfetch.com
    BRANDFETCH_CLIENT_ID: str = ""

    # ── LinkedIn OAuth ────────────────────────────────────────────────────────
    LINKEDIN_CLIENT_ID: str = ""
    LINKEDIN_CLIENT_SECRET: str = ""
    LINKEDIN_REDIRECT_URI: str = "http://localhost:8000/api/auth/linkedin/callback"

    # ── Google OAuth (Sign in with Google — OpenID Connect) ──────────────────
    # Create credentials at https://console.cloud.google.com/apis/credentials
    # Authorized redirect URI must match GOOGLE_REDIRECT_URI exactly.
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/auth/google/callback"

    # ── Semantic Skills Matching (E5-S2) ─────────────────────────────────────
    # Provider: "openai" (uses EMBEDDING_MODEL) | "sentence_transformer" (local)
    SEMANTIC_EMBEDDER: str = "openai"
    # Cosine similarity threshold to classify a skill as matched (0.75 per spec)
    SKILL_MATCH_THRESHOLD: float = 0.75
    # LRU cache entries for skill embeddings (one entry per unique skill phrase)
    EMBEDDING_CACHE_SIZE: int = 10_000
    # Local model name when SEMANTIC_EMBEDDER=sentence_transformer
    SENTENCE_TRANSFORMER_MODEL: str = "all-MiniLM-L6-v2"

    # ── Razorpay payments ─────────────────────────────────────────────────────
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""

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
