from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # "development" (default) | "production". Gates dev-only shortcuts like
    # /api/auth/dev-login. Set ENVIRONMENT=production in the deployed .env.
    ENVIRONMENT: str = "development"

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
    # Business mail is on Titan; sender is talent@nideknil.in. SMTP_USER/PASSWORD
    # come from .env (the mailbox must be allowed to send as FROM_EMAIL).
    SMTP_HOST: str = "smtp.titan.email"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    FROM_EMAIL: str = "talent@nideknil.in"

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

    # ── AI Fluency assignments (transcript analysis pipeline) ────────────────
    # Provider for the judge LLM. Empty → falls back to AI_PROVIDER. Kept
    # separate so the judge can move to "claude" later without touching the
    # rest of the platform's AI routing.
    FLUENCY_AI_PROVIDER: str = ""
    # Cheap model that reads transcript chunks; stronger model that aggregates.
    FLUENCY_CHUNK_MODEL: str = "gpt-4o-mini"
    FLUENCY_AGGREGATE_MODEL: str = "gpt-4o"
    # Claude equivalents, used when the judge provider is "claude".
    FLUENCY_CHUNK_MODEL_CLAUDE: str = "claude-haiku-4-5-20251001"
    FLUENCY_AGGREGATE_MODEL_CLAUDE: str = "claude-sonnet-4-5"
    # Hard cap on effective tokens fed to the judge per submission — bounds
    # cost regardless of raw transcript size (sessions are sampled if over).
    FLUENCY_TOKEN_BUDGET: int = 400_000
    # Max tokens per chunk request (leaves headroom in a 128K-context model).
    FLUENCY_CHUNK_TOKENS: int = 24_000
    # Parallel chunk-scoring calls per submission.
    FLUENCY_CHUNK_CONCURRENCY: int = 4
    # Upload caps for candidate transcript bundles.
    FLUENCY_MAX_FILE_MB: int = 25
    FLUENCY_MAX_TOTAL_MB: int = 80
    FLUENCY_MAX_FILES: int = 40

    # ── Razorpay payments ─────────────────────────────────────────────────────
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""

    # ── Claude Code MCP companion servers (routers/mcp_candidate.py, mcp_recruiter.py) ──────
    # Base URL candidates/recruiters use to `claude mcp add` against this backend. Locally
    # this is the backend's own address; in production set to the deployed API host.
    MCP_PUBLIC_URL: str = "http://localhost:8000"
    # DNS-rebinding protection (mcp SDK's TransportSecuritySettings) only trusts Host headers
    # matching these patterns by default (127.0.0.1/localhost/::1 with a port) — a REAL request
    # to a deployed domain gets 421 Misdirected Request unless the real host is added here.
    # Comma-separated, e.g. "nideknil.in,api.nideknil.in". Empty in dev (127.0.0.1/localhost
    # are always allowed regardless of this setting).
    MCP_ALLOWED_HOSTS: str = ""

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
