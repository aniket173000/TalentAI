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

    # ── OpenAI response cache (Redis) ────────────────────────────────────────
    # Caches exact-repeat chat-completion/embedding calls (e.g. re-ranking the
    # same unchanged (job, candidate) pair across funnel runs). Separate DB
    # index from the Celery broker/backend above so it can be inspected/cleared
    # independently. Fails open — a cache outage never blocks a real LLM call.
    LLM_CACHE_ENABLED: bool = True
    LLM_CACHE_TTL_SECONDS: int = 604800          # 7 days — chat completions
    LLM_CACHE_EMBEDDING_TTL_SECONDS: int = 5184000  # 60 days — embeddings are near-immutable per (model, text)
    LLM_CACHE_REDIS_URL: str = "redis://localhost:6379/1"

    # ── AI provider (Strategy pattern) ───────────────────────────────────────
    # Supported values: "openai" | "claude" (stub)
    AI_PROVIDER: str = "openai"
    # Model tiers (OpenAI GPT-5 reasoning family; gpt-4o/4o-mini were retired 2026).
    # AI_MODEL       — core reasoning: resume screening, ranking, rank explanations,
    #                  skill verification, structured extraction, JD parsing.
    # AI_MODEL_MINI  — moderate extraction/generation (skills/education parse,
    #                  resume tailoring, college info/resolve, autocomplete).
    # AI_MODEL_NANO  — trivial classification (feedback triage).
    # These are reasoning models: the API needs max_completion_tokens (not
    # max_tokens), rejects custom temperature, and takes an optional reasoning_effort.
    AI_MODEL: str = "gpt-5.5"
    AI_MODEL_MINI: str = "gpt-5.4-mini"
    AI_MODEL_NANO: str = "gpt-5.4-nano"
    # NOTE: embeddings are pinned — changing the model changes vector dimensions and
    # would invalidate every embedding already stored in pgvector (needs a re-embed
    # migration, not a config flip).
    EMBEDDING_MODEL: str = "text-embedding-3-small"

    # ── Rerank stage (funnel stage 2) ────────────────────────────────────────
    # Hosted Cohere Rerank replaces the local bge cross-encoder so no torch is
    # loaded on memory-constrained hosts. Get a key at https://dashboard.cohere.com
    COHERE_API_KEY: str = ""
    RERANK_MODEL: str = "rerank-v3.5"

    # ── Email ─────────────────────────────────────────────────────────────────
    # Business mail is GoDaddy Professional Email (mailbox talent@nideknil.in),
    # so we send through GoDaddy's relay smtpout.secureserver.net — the domain's
    # SPF already authorises secureserver.net, so this delivers without DNS edits.
    # SMTP_USER/PASSWORD come from .env; SMTP_USER must equal FROM_EMAIL.
    SMTP_HOST: str = "smtpout.secureserver.net"
    SMTP_PORT: int = 587  # STARTTLS; use 465 with use_tls=True for SSL
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    FROM_EMAIL: str = "talent@nideknil.in"

    FRONTEND_URL: str = "http://localhost:5173"

    # ── Outreach agent (LinkedIn-post → cold-email drafter) ─────────────────────
    # Powers the admin "Outreach" tool: paste a hiring post, extract the contact +
    # roles, and draft a Nideknil pitch. Uses a free-tier LLM by default so it
    # never touches the paid ranking budget. Provider: "gemini" | "groq" | "openai".
    #   gemini → Google AI Studio free tier (https://aistudio.google.com/apikey)
    #   groq   → https://console.groq.com/keys
    # Falls back to the main OPENAI/ANTHROPIC provider only if explicitly set.
    OUTREACH_LLM_PROVIDER: str = "gemini"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-flash-latest"
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

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

    # ── Candidate Cold Email (paste hiring post → send from candidate's Gmail) ──
    # Same Google Cloud project/credentials as Sign-in-with-Google above; the
    # gmail.send scope is RESTRICTED — the consent screen must list it and the
    # redirect URI below must be registered exactly. Until Google verification
    # completes, only test users on the consent screen can connect.
    GMAIL_REDIRECT_URI: str = "http://localhost:8000/api/cold-email/gmail/callback"
    # Fernet key (32-byte urlsafe base64, generate with
    # `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`).
    # Empty → key is derived from JWT_SECRET (fine for dev; set explicitly in prod
    # so rotating JWT_SECRET doesn't orphan every stored Gmail credential).
    TOKEN_ENCRYPTION_KEY: str = ""
    # Quotas: free-plan monthly sends, and a hard per-day cap for EVERY plan —
    # the daily cap protects the candidate's own Gmail reputation and our OAuth
    # app standing, so it is deliberately not lifted by paying.
    COLD_EMAIL_FREE_MONTHLY: int = 5
    COLD_EMAIL_DAILY_CAP: int = 10

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
    FLUENCY_CHUNK_MODEL: str = "gpt-5.4-mini"
    FLUENCY_AGGREGATE_MODEL: str = "gpt-5.5"
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

    # ── AI Fluency Team Report ("Pulse") ─────────────────────────────────────
    # Second product line: continuous, per-team AI-fluency reporting for a
    # company's OWN engineers (not job candidates). Reuses the entire fluency
    # engine above in a brief-free "general work" scoring mode.
    PULSE_ENABLED: bool = True
    # Base URL an engineer uses to `claude mcp add` the Pulse MCP server. Same
    # host as the backend; mounted at /mcp-pulse in main.py.
    PULSE_MCP_PUBLIC_URL: str = "http://localhost:8000"
    # How many top-scoring sessions the Playbook extractor mines per period.
    PULSE_PLAYBOOK_TOP_K: int = 5
    # Minimum submitted sessions in a period before a report is considered
    # meaningful (avoids over-indexing on a single short session).
    PULSE_MIN_SESSIONS_FOR_REPORT: int = 1
    # Free-trial length: seats/period granted before payment is required.
    PULSE_TRIAL_SEATS: int = 5

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

    # ── Recruiter Voice Copilot (OpenAI Realtime API, browser-direct WebRTC) ──
    # Backend only mints a short-lived ephemeral client secret via this model; the
    # browser then connects straight to OpenAI over WebRTC — audio never touches
    # this backend. Verify the current realtime model id + per-minute audio
    # pricing against live OpenAI docs before deploying; do not assume this default.
    REALTIME_MODEL: str = "gpt-realtime"
    REALTIME_VOICE: str = "alloy"
    # Hard cap enforced both server-side (session `expires_after`) and client-side
    # (frontend force-closes the peer connection) — the real cost backstop, since
    # our backend never sees session-end once WebRTC is negotiated.
    VOICE_SESSION_MAX_DURATION_SECONDS: int = 600

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
