name: "AI Fluency for Engineering Teams — MVP (single-org pilot, MCP seat + monthly reports)"
description: |

---

## REVISION NOTE (read first)

This PRP scopes ONLY the **MVP** phase from `docs/PRD_ai_fluency_teams.md` §12: single-org pilot, manual
submission only (no git hook), individual + team report, no Playbook yet, OpenAI judge only, monthly
cadence. Full product vision (multi-org scale, Playbook, weekly cadence, redaction rules) is in
`docs/PRD_ai_fluency_teams.md` and `docs/HLD_ai_fluency_teams_architecture.md` — do not build ahead of
this PRP's task list; v1/v1.1/v2 items are explicitly deferred (see "What's deliberately NOT in MVP" below).

**Important correction discovered during codebase analysis**: the PRD assumed the `nideknil-submit` CLI
needs "zero code changes" (copying the pattern from the already-shipped MCP-apply-channel feature, where
that was true). It is **not** true here — the CLI's target URL is a hardcoded literal
(`tools/nideknil-submit/bin/cli.js` line ~171: `` `${apiBase}/api/assignments/portal/${token}/submit}` ``),
not parameterized. This PRP includes a small, backward-compatible CLI change (a `--kind` flag) to support
a second endpoint shape. See Task 9 and "Known Gotchas."

**Also discovered**: the take-home Assignment/FluencyReport pipeline this PRD assumed was still
unbuilt is **already fully shipped**, including its own MCP companion servers (`routers/mcp_candidate.py`,
`routers/mcp_recruiter.py`, `services/mcp_bridge.py`, `mcp==1.28.1` pinned, both mounted with a working
`lifespan`). This PRP reuses those exact, working, real patterns (not a plan) — every "mirror this" note
below points at real, tested code, not a draft.

## Goal

**Feature Goal**: Let one company (an "Organization") invite its engineers as "Seats," have each engineer
connect their own Claude Code via a new MCP server using a per-seat bearer token, submit their real work
session transcripts on a monthly cadence through the existing `nideknil-submit` CLI (lightly extended), and
have the backend score each submission with the SAME AI-fluency judge pipeline already built for take-home
assignments — producing an individual report per engineer (visible only to that engineer) and a live
team-level rollup (visible to the Org Admin).

**Deliverable**:
- Backend: 4 new models (`Organization`, `OrgSeat`, `OrgSubmission`, `OrgFluencyReport`), 2 new services
  (`services/org_bridge.py`, `services/fluency/org_pipeline.py`), 1 new storage helper
  (`services/storage_service.upload_org_transcript_file` + `services/fluency/store.store_org_transcript`),
  1 new Celery task (`run_org_fluency_analysis_task`), 2 new routers (`routers/orgs.py`,
  `routers/mcp_org_seat.py`), a third mounted MCP server (`/mcp/pulse`).
- A small, backward-compatible addition to `tools/nideknil-submit/bin/cli.js` (`--kind org|assignment`
  flag, default `assignment` — zero behavior change for existing callers).
- Two new frontend pages: `PulseDashboard.tsx` (Org Admin: create org, invite/revoke seats, team report)
  and `PulseSeatPortal.tsx` (token-based, mirrors `AssignmentPortal.tsx`: engineer's own report only).
- Branch: continue on `feature/mcp-apply-channel` or cut a new branch — confirm with the user before
  starting (not decided in this PRP).

**Success Definition**: An authenticated user creates an Organization, invites an engineer by name+email,
that engineer receives an email with a `claude mcp add` command, connects Claude Code, asks "how do I
submit my session" and gets back a real `npx nideknil-submit <token> --kind org` command, runs it after a
month of real work, the transcript is scrubbed/stored/scored by the existing judge pipeline (unmodified
rubric/chunking/token-budget code, reused not rewritten), the engineer can ask their own connected Claude
Code "what's my AI fluency report" and get a real answer, and the Org Admin sees a team-level table of all
seats with their latest scores — all while a second Organization's admin/seats can never see or touch the
first Organization's data.

## User Persona

**Target User (Org Admin)**: A CTO/VP Eng/Head of Platform at a pilot customer company, already an
authenticated user on the platform (existing JWT auth, no new auth mechanism), who wants to see how well
their engineering team collaborates with AI without reading every transcript personally.

**Target User (Engineer/Seat)**: An individual contributor at that company who already uses Claude Code for
real work, who connects it once via MCP and submits once a month — no new login, no new account, no web
dashboard required to participate (mirrors the take-home candidate's no-login token-based flow exactly).

**Use Case (Org Admin)**: Creates an org, invites 5-20 engineers by email, waits a month, opens the team
report to see score distribution and who might need coaching.

**Use Case (Engineer)**: Gets an invite email, runs `claude mcp add`, works normally for a month, at
month-end asks Claude Code "how do I submit my Pulse session" → gets the exact CLI command → runs it →
later asks "what's my AI fluency report" and gets their own score/strengths/gaps back, never anyone else's.

**User Journey (Org Admin)**:
1. `POST /api/orgs` with `{name, cadence: "monthly"}` (any authenticated user can create one for MVP — no
   new capability/extension row, ownership is just `Organization.admin_user_id == current_user.id`, the
   same idiom already used for job/recruiter ownership checks elsewhere in this codebase).
2. `POST /api/orgs/{org_id}/seats` with `{engineer_name, engineer_email}` → generates an `OrgSeat` with a
   `mcp_key` (same `secrets.token_urlsafe(32)` pattern as every other bearer credential in this codebase)
   → sends an invite email containing the `claude mcp add` command.
3. A month later, `GET /api/orgs/{org_id}/team-report` → a live aggregate query (seat name, latest
   `OrgFluencyReport.overall_score`, `mcp_last_seen_at`, submission status) — **no pre-aggregation/rollup
   worker in MVP**, see "What's deliberately NOT in MVP."

**User Journey (Engineer)**:
1. Gets the invite email, runs:
   `claude mcp add --transport http nideknil-pulse <MCP_PUBLIC_URL>/mcp/pulse --header "Authorization: Bearer <mcp_key>"`
2. Works normally in Claude Code for the month — zero product-visible change to their day-to-day.
3. At month end, asks Claude Code "how do I submit for Pulse" → `get_submission_instructions` tool →
   returns `npx nideknil-submit <mcp_key> --kind org` (plus a portal URL fallback).
4. Runs that command from their project directory; the CLI scrubs locally, POSTs multipart to
   `/api/orgs/seats/portal/{token}/submit` (new endpoint, same shape as the existing
   `candidate_submit`), which scrubs again server-side, stores the transcript, creates an `OrgSubmission`,
   and dispatches analysis.
5. Later asks Claude Code "what's my AI fluency report" → `get_my_report` tool → returns their own latest
   `OrgFluencyReport` (score, summary, dimension breakdown) — never another seat's.

**Pain Points Addressed**: Same as the take-home flow's candidate side — no context-switch to a browser,
no remembering a submit command from a month-old email. New for this product: the engineer gets an honest,
private signal on their own AI usage without a manager watching over their shoulder in real time.

## Why

- This validates the PRD's core hypothesis (continuous internal AI-fluency coaching, sold to companies)
  with the **absolute minimum new infrastructure** — reusing the entire scoring engine
  (`services/fluency/{chunking,judge,metrics,transcript_parser,scrubber,store}.py`) and the entire MCP
  mounting pattern (`FastMCP` + `lifespan` + `AsyncExitStack`) already proven in production-shape code for
  the take-home feature. Nothing about the judge, the rubric, or the MCP transport layer is new — only the
  entity model (Organization/Seat vs. Job/Assignment) and the trigger (cadence, not a single invite) differ.
- Single-org pilot scope deliberately avoids building the HLD's full-scale design (read replicas, scheduled
  rollup workers, Redis cache, row-level security) before there is a single real customer to validate the
  product with — see "What's deliberately NOT in MVP."

## What

### Success Criteria

- [ ] An authenticated user can create an `Organization` and invite `OrgSeat`s by name+email; only that
  org's `admin_user_id` can invite/revoke/view its seats (ownership-checked on every org-scoped endpoint).
- [ ] An invited engineer can `claude mcp add` using their `mcp_key` and successfully call
  `get_org_brief`, `get_submission_instructions`, and `get_my_report` — each scoped strictly to THEIR OWN
  `OrgSeat` row.
- [ ] `npx nideknil-submit <mcp_key> --kind org` (new flag) correctly POSTs to
  `/api/orgs/seats/portal/{token}/submit` and the EXISTING `assignment` flow
  (`npx nideknil-submit <token>` with no flag) is **provably unchanged** — confirm by re-running the
  existing assignment submit flow with zero new flags and confirming identical behavior/URL.
- [ ] A submitted transcript is scrubbed (client CLI + server, same as today), parsed via the EXISTING
  `parse_claude_code_jsonl`, stored via a new org-scoped key prefix, and scored by the EXISTING
  `get_fluency_judge()` pipeline (chunking/token-budget/rubric all unmodified) into a new
  `OrgFluencyReport` row.
- [ ] The Org Admin's team-report endpoint shows all seats with their latest score/status; a second org's
  admin gets 403/empty when querying the first org's `org_id`.
- [ ] No transcript file bytes are ever passed as an MCP tool-call argument (same hard constraint as the
  existing candidate/recruiter MCP servers) — file transfer stays exclusively on the HTTP upload path.
- [ ] `/mcp/pulse` does not get swallowed by the existing `/mcp` mount (Starlette prefix-matching gotcha —
  see Known Gotchas) and does not break the existing `/mcp` or `/mcp/recruiter` mounts.

### What's deliberately NOT in MVP (do not build these — they are v1/v1.1/v2 per the PRD)

- No Playbook / technique extraction / anonymization logic.
- No pre-aggregated `TeamFluencyReport` rollup worker, no Redis cache layer, no read replicas — the team
  report is a **live aggregate SQL query** at request time. This is correct at single-org pilot scale; the
  HLD's caching/rollup design is explicitly a scale concern for the 1-lakh-seat future, not this PRP.
- No git post-push hook / auto-submission.
- No customer-controlled redaction rules beyond the existing secret-scrubber.
- No Claude judge switch-over UI (the `FLUENCY_AI_PROVIDER` env var already supports it; MVP just uses
  whatever the platform is already configured with — OpenAI per current `.env`).
- No new "capability extension" row (no `OrgAdminExtension` mirroring `RecruiterExtension`) — org ownership
  is a plain `admin_user_id` FK comparison, the simplest thing that works for one admin per org in MVP.
- No engineer-facing login/dashboard — the token-based portal (`PulseSeatPortal.tsx`) and MCP tool are the
  only ways an engineer sees their own report, exactly mirroring how `AssignmentPortal.tsx` works today.

## All Needed Context

### Context Completeness Check

_Validated: every reused function/pattern below is cited with file:line from code that is verified to
exist and work today (not a prior draft) — a fresh implementer needs no other context to start Task 1._

### Documentation & References

```yaml
# ── Internal: the EXISTING take-home pipeline this MVP reuses almost entirely unchanged ──────────────
- file: backend/services/fluency/pipeline.py
  why: `execute_fluency_analysis` (line 79) is the exact shape to mirror for the new
    `execute_org_fluency_analysis` — same compare-and-set claim pattern (lines 85-99: filter
    `status.in_(["submitted","failed"])`, update to `"processing"`, `synchronize_session=False`), same
    try/except → `status="failed"` + `error=str(exc)[:2000]` on failure (lines 122-132), same
    `asyncio.run(_analyze(...))` call shape (line 108), same idempotent-replace-report-then-commit order
    (lines 110-119).
  pattern: COPY this file's structure into a new `org_pipeline.py`, do not import/reuse it directly since
    it is hardcoded to `models.AssignmentSubmission`/`models.FluencyReport` throughout.
  gotcha: `_analyze` (line 137) builds prompts via `build_chunk_prompt(chunk_text, assignment_brief,
    evaluation_focus)` (see prompts.py below) — there is no "brief" for a real-work session; see Known
    Gotchas for the MVP tradeoff on this.

- file: backend/services/fluency/judge.py
  why: `get_fluency_judge(provider=None)` (line ~150, `@lru_cache(maxsize=2)`) — REUSE THIS FUNCTION
    UNCHANGED, do not fork it. It already reads `settings.FLUENCY_AI_PROVIDER or settings.AI_PROVIDER`.
    `FluencyJudge.score_chunks(chunks, assignment_brief, evaluation_focus)` and
    `FluencyJudge.aggregate(chunk_results, metrics, integrity_flags, assignment_brief, evaluation_focus)`
    are the two calls `_analyze`/`_analyze_org` must make.
  critical: `CHUNK_SYSTEM`/`AGGREGATE_SYSTEM` (imported from `prompts.py`) are HARDCODED constants used
    inside the ABC's concrete method bodies (judge.py lines ~57, ~94) — they are NOT parameters. They say
    "candidate", "take-home project", "recruiter" throughout. See Known Gotchas for the MVP decision on
    this (reuse as-is vs. parameterize) — this PRP's recommended MVP path is REUSE AS-IS with a crafted
    `assignment_brief` string, accepting the wording mismatch as a documented, deferred limitation.

- file: backend/services/fluency/prompts.py
  why: `RUBRIC`/`RUBRIC_KEYS` (lines 12-64) — the 8-dimension rubric — REUSE UNCHANGED, do not fork the
    rubric itself for MVP (the PRD's "adapt the rubric for real-work context" is a v1 item, not MVP).
    `build_chunk_prompt(chunk_text, assignment_brief, evaluation_focus)` (~line 80) and
    `build_aggregate_prompt(chunk_results, metrics, integrity_flags, assignment_brief, evaluation_focus)`
    interpolate `assignment_brief` into a template — pass a crafted string here (see Implementation
    Patterns) rather than forking these functions.

- file: backend/services/fluency/chunking.py
  why: `build_chunks`/`enforce_budget` — REUSE UNCHANGED. Same `FLUENCY_TOKEN_BUDGET`/`FLUENCY_CHUNK_TOKENS`
    settings, same 4-pass reduction ladder. No org-specific budget needed for MVP.

- file: backend/services/fluency/metrics.py
  why: `compute_metrics`, `compute_integrity_flags`, `correlate_git` — REUSE UNCHANGED. `correlate_git`
    is optional (only meaningful if `git_metadata` was submitted) — the existing assignment flow already
    treats it as optional; org submissions follow the same optionality.

- file: backend/services/fluency/transcript_parser.py
  why: `parse_claude_code_jsonl(raw, fallback_session_id)` and `TranscriptParseError` — REUSE UNCHANGED,
    identical to how `routers/assignments.py`'s `candidate_submit` uses it.

- file: backend/services/fluency/scrubber.py
  why: `scrub_transcript_bytes` — REUSE UNCHANGED. Must run on raw bytes BEFORE storage, exactly as
    `routers/assignments.py:421` does it, and exactly as `tools/nideknil-submit/bin/cli.js:121` already
    does client-side (that CLI-side call needs zero change — it scrubs before any endpoint-specific logic).

- file: backend/services/fluency/store.py
  why: `store_transcript(content, assignment_id, submission_id, filename) -> str` (line 31) is the exact
    shape to mirror for a new `store_org_transcript(content, org_id, seat_id, submission_id, filename) ->
    str` — same `"s3:"`/`"local:"` key-prefix convention, same `_LOCAL_ROOT`-relative local fallback
    pattern (line 23), same path-traversal guard (lines 51-55). `load_transcript(key)` (line 45) is
    generic (branches on the `s3:`/`local:` prefix only) — REUSE UNCHANGED, no org-specific load needed.

- file: backend/services/storage_service.py
  why: `upload_transcript_file(content, assignment_id, submission_id, filename)` (line 152) builds S3 key
    `f"assignments/{assignment_id}/{submission_id}/{uuid.uuid4().hex}-{safe}"` (line 162) — mirror this
    exactly for a new `upload_org_transcript_file(content, org_id, seat_id, submission_id, filename)` with
    key prefix `f"orgs/{org_id}/{seat_id}/{submission_id}/{uuid.uuid4().hex}-{safe}"`. Do NOT reuse
    `upload_transcript_file` directly by passing org_id in place of assignment_id — that would misfile org
    transcripts under an `"assignments/"` S3 prefix, confusing future ops/debugging.

- file: backend/services/tasks.py
  why: `run_fluency_analysis_task` (line 22, `@celery_app.task(name="run_fluency_analysis_task",
    acks_late=True)`) — mirror EXACTLY for a new `run_org_fluency_analysis_task`, same `acks_late=True`,
    same one-line delegation to the pipeline's `execute_*` function.

# ── Internal: the EXISTING, ALREADY-SHIPPED MCP servers (mirror these, they are real working code) ─────
- file: backend/routers/mcp_candidate.py
  why: THIS IS THE FILE TO MIRROR MOST CLOSELY for the new `routers/mcp_org_seat.py`. Read it in full —
    it is short (116 lines). Key pieces to copy the SHAPE of, not the content:
    `mcp = FastMCP("nideknil-assignment", stateless_http=True, streamable_http_path="/",
    transport_security=build_transport_security())` (lines 30-35) — the new server needs
    `FastMCP("nideknil-pulse", ...)` with the SAME `stateless_http=True`/`streamable_http_path="/"`/
    `transport_security=build_transport_security()` args (the last one REUSED from
    `services/mcp_bridge.py`, not re-implemented).
    `_authenticate(ctx) -> tuple[db, submission]` (lines 52-78) — mirror exactly, but resolve `OrgSeat`
    by `mcp_key` instead of `AssignmentSubmission` by `access_token` via a new `_seat_by_token` helper
    (see routers/orgs.py plan below), and call a new `mark_seat_mcp_connected` instead of
    `mark_mcp_connected`.
    The `_reject`/`AuthError`/rate-limit-on-failure-only pattern (lines 38-49) — REUSE
    `check_rate_limit`/`check_auth_failure_rate_limit` DIRECTLY from `services/mcp_bridge.py` (they are
    generic, not assignment-specific — do not fork them).
  critical: `streamable_http_path="/"` is REQUIRED on every FastMCP instance mounted this way — omitting
    it makes the server's internal route default to `/mcp` regardless of mount prefix, which 404s (see
    main.py comment, cited below).

- file: backend/services/mcp_bridge.py
  why: Mirror `mark_mcp_connected` (line 47) → new `mark_seat_mcp_connected(db, seat)` (idempotent:
    `connected_at` set once, `last_seen_at` bumped every call — same two-field idempotency pattern
    `OrgSeat` needs). Mirror `issue_recruiter_key`/`revoke_recruiter_key` (lines 59-76) → new
    `issue_org_seat(db, org, name, email)`/`revoke_org_seat(db, seat_id, org)` for `OrgSeat` instead of
    `RecruiterMcpApiKey`. REUSE `build_transport_security()`, `check_rate_limit()`,
    `check_auth_failure_rate_limit()` DIRECTLY (import from this module, do not duplicate) — they are
    generic helpers already shared across the two existing MCP servers.
  pattern: put the new org-specific functions in a NEW `services/org_bridge.py` (mirrors the existing
    file's role for the new domain) rather than growing `mcp_bridge.py` with unrelated org logic — but
    import the three generic helpers above FROM `mcp_bridge.py` into `org_bridge.py`/`mcp_org_seat.py`.

- file: backend/main.py
  why (lifespan, lines ~467-473):
    ```python
    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI):
        _warm_reranker()
        async with contextlib.AsyncExitStack() as stack:
            await stack.enter_async_context(candidate_mcp.session_manager.run())
            await stack.enter_async_context(recruiter_mcp.session_manager.run())
            yield
    ```
    ADD a third `await stack.enter_async_context(org_seat_mcp.session_manager.run())` line inside the SAME
    `AsyncExitStack` block.
  critical (mount order, lines ~515-525 — READ THE EXISTING COMMENT IN FULL, it already explains the
    exact bug class to avoid):
    ```python
    # NOTE: order matters — Starlette matches Mounts in registration order, and "/mcp" is
    # a literal prefix of "/mcp/recruiter". Mounting the more specific path FIRST is
    # required, or every /mcp/recruiter/* request gets swallowed by the /mcp mount first...
    app.mount("/mcp/recruiter", recruiter_mcp.streamable_http_app())
    app.mount("/mcp", candidate_mcp.streamable_http_app())
    ```
    `/mcp/pulse` is ALSO more specific than `/mcp` and must ALSO be mounted before it:
    ```python
    app.mount("/mcp/recruiter", recruiter_mcp.streamable_http_app())
    app.mount("/mcp/pulse", org_seat_mcp.streamable_http_app())   # NEW — must precede "/mcp" below
    app.mount("/mcp", candidate_mcp.streamable_http_app())
    ```
    (Relative order between `/mcp/recruiter` and `/mcp/pulse` does not matter — neither is a prefix of the
    other — only that both precede the bare `/mcp` mount.)
  pattern (router registration order, lines 497-514): `app.include_router(...)` calls are a flat ordered
    list ending with `assignments_router.router` then `recruiter_mcp_keys_router.router` — ADD
    `app.include_router(orgs_router.router)` after the last existing entry, following the same style.
  pattern (migrations, lines 72-285 `_MIGRATIONS` list + execution loop 291-297): **NOT NEEDED for this
    PRP** — all 4 new models are brand-new tables, auto-created via `models.Base.metadata.create_all(bind=
    engine)` (line 44) with zero `_MIGRATIONS` entries, exactly like `RecruiterMcpApiKey` needed none.
    Only an ALTER on an EXISTING table needs a `_MIGRATIONS` entry — this PRP does not alter any existing
    table.

- file: backend/routers/assignments.py
  why: `_by_token(db, token)` (~line 339) and `candidate_view(token, db)` (~line 344, referenced in
    mcp_candidate.py) are the exact pattern for the new `_seat_by_token(db, token) -> OrgSeat` and
    `seat_view(token, db) -> OrgSeatReportView` in `routers/orgs.py`. `candidate_submit` (lines 373-471)
    is the exact pattern for the new `POST /api/orgs/seats/portal/{token}/submit` endpoint — same
    `File(...)`/`Form(...)` signature shape (files, repo_url, consent, git_metadata, submit_source), same
    scrub → parse-validate (collecting `parse_errors`, skipping unparseable files rather than failing the
    whole request) → store → persist → `dispatch_*` order (lines 421-467).
  gotcha: `access_token=secrets.token_urlsafe(32)` (line 254) is the exact call to reuse for
    `OrgSeat.mcp_key` generation — same stdlib `secrets` import, same 32-byte urlsafe token shape, no new
    library.

- file: tools/nideknil-submit/bin/cli.js
  why: Lines ~161-186 build the request:
    ```js
    const url = `${apiBase}/api/assignments/portal/${token}/submit`;
    res = await fetch(url, { method: 'POST', body: form });
    ```
    This URL is a HARDCODED literal — there is no `--endpoint`/path-template flag today, only `--api`
    (origin) and the positional `<token>`. **This PRP's Task 9 adds a `--kind org|assignment` flag**
    (default `assignment`, preserving today's behavior byte-for-byte when the flag is omitted) that swaps
    the literal to `${apiBase}/api/orgs/seats/portal/${token}/submit`. `scrubBuffer(raw)` (line ~121, local
    client-side scrub) and the `consent`/`submit_source`/`repo_url`/`git_metadata` form fields (lines
    161-167) need ZERO changes — they are endpoint-agnostic.

- file: backend/config.py
  why: Reuse UNCHANGED — `FLUENCY_AI_PROVIDER`/`FLUENCY_CHUNK_MODEL`/`FLUENCY_AGGREGATE_MODEL`/
    `FLUENCY_TOKEN_BUDGET`/`FLUENCY_CHUNK_TOKENS`/`FLUENCY_CHUNK_CONCURRENCY` (all judge/chunking config),
    `FLUENCY_MAX_FILE_MB`/`FLUENCY_MAX_TOTAL_MB`/`FLUENCY_MAX_FILES` (reuse these SAME limits for org
    submissions in MVP rather than adding parallel `PULSE_MAX_*` settings — no product requirement yet for
    different limits), `MCP_ALLOWED_HOSTS` (reused by `build_transport_security()`, already generic across
    servers), `USE_CELERY`, `S3_BUCKET`/AWS settings, `JWT_*` (existing auth, no change). **No new config
    fields are required for this PRP.**

# ── PRD/HLD this PRP implements the MVP slice of ─────────────────────────────────────────────────────
- file: docs/PRD_ai_fluency_teams.md
  why: Product requirements, personas, rubric intent, monetization, phased rollout. Section 12 ("Phased
    rollout") defines exactly what MVP means — this PRP implements that section only.
- file: docs/HLD_ai_fluency_teams_architecture.md
  why: Full-scale architecture (CAP tradeoffs, caching, rollup workers, multi-tenancy at 1-lakh-seat
    scale). This PRP deliberately does NOT build most of it yet — see "What's deliberately NOT in MVP."
    The one piece already followed even at MVP scale: async dispatch (submission returns immediately,
    scoring happens on a worker) — same `202`-shaped UX as the existing assignment/ranking flows.
```

### Current Codebase tree (relevant subset)

```bash
backend/
  main.py                          # create_all() L44; _MIGRATIONS L72-285; lifespan L467-473;
                                    # app=FastAPI(lifespan=lifespan) L476; include_router L497-514;
                                    # mcp mounts L519-525 (order-sensitive); /health L527
  models.py                        # User(67) CandidateExtension(154) RecruiterExtension(190) Job(544)
                                    # Application(588) Assignment(762) AssignmentSubmission(790)
                                    # FluencyReport(843) RecruiterMcpApiKey — NO Organization/Company model
  config.py                        # FLUENCY_* (91-108), MCP_ALLOWED_HOSTS (124), S3_*, JWT_*, USE_CELERY
  routers/
    assignments.py                 # _by_token, _own_submission, candidate_view, candidate_submit (373),
                                    # _send_invite_email — the flow this PRP's org flow structurally mirrors
    mcp_candidate.py                # WORKING FastMCP server — mirror its shape exactly (116 lines)
    mcp_recruiter.py                # WORKING second FastMCP server — confirms 2-server pattern is proven
    recruiter_mcp_keys.py           # WORKING key issuance router — mirror for org seat issuance style
  services/
    mcp_bridge.py                   # build_transport_security, check_rate_limit,
                                    # check_auth_failure_rate_limit, mark_mcp_connected, issue/revoke key
    storage_service.py               # upload_transcript_file (152) — S3 key convention to mirror
    tasks.py                         # run_fluency_analysis_task — Celery task to mirror
    fluency/
      pipeline.py                    # execute_fluency_analysis (79), _analyze (137) — mirror structure
      judge.py                       # get_fluency_judge (~150), FluencyJudge ABC, CHUNK/AGGREGATE_SYSTEM
      prompts.py                     # RUBRIC (12-64), build_chunk_prompt, build_aggregate_prompt
      chunking.py                    # build_chunks, enforce_budget — reuse unchanged
      metrics.py                     # compute_metrics, compute_integrity_flags, correlate_git
      transcript_parser.py           # parse_claude_code_jsonl, TranscriptParseError
      scrubber.py                    # scrub_transcript_bytes
      store.py                       # store_transcript (31), load_transcript (45) — mirror store_*
tools/nideknil-submit/bin/cli.js     # hardcoded URL literal ~line 171 — needs the --kind flag (Task 9)
frontend/src/pages/
  AssignmentPortal.tsx               # /assignment/:token — pattern for PulseSeatPortal.tsx
  JobAssignments.tsx                  # recruiter's submissions list — loose pattern for PulseDashboard.tsx
docs/
  PRD_ai_fluency_teams.md             # product spec this PRP's MVP section implements
  HLD_ai_fluency_teams_architecture.md # full-scale architecture — NOT built in this PRP
```

### Desired Codebase tree with files to be added and responsibility of file

```bash
backend/
  models.py                          # MODIFY: + Organization, OrgSeat, OrgSubmission, OrgFluencyReport
  main.py                            # MODIFY: + lifespan 3rd context; + mount "/mcp/pulse" (order!);
                                      # + app.include_router(orgs_router.router)
  requirements.txt                    # NO CHANGE — mcp==1.28.1 already pinned, reused as-is
  routers/
    orgs.py                           # NEW: org CRUD, seat invite/revoke, team-report (live aggregate),
                                       # seat portal GET (own report) + POST (submit), all JWT- or
                                       # token-based per endpoint, mirroring assignments.py's dual model
    mcp_org_seat.py                    # NEW: FastMCP #3 "nideknil-pulse" — get_org_brief,
                                       # get_submission_instructions, get_my_report; auth = OrgSeat.mcp_key
  services/
    org_bridge.py                      # NEW: mark_seat_mcp_connected, issue_org_seat, revoke_org_seat;
                                       # imports build_transport_security/check_rate_limit/
                                       # check_auth_failure_rate_limit FROM services/mcp_bridge.py
    storage_service.py                  # MODIFY: + upload_org_transcript_file (mirrors upload_transcript_file)
    fluency/
      store.py                          # MODIFY: + store_org_transcript (mirrors store_transcript)
      org_pipeline.py                    # NEW: dispatch_org_fluency_analysis, execute_org_fluency_analysis,
                                         # _analyze_org — mirrors pipeline.py, targets OrgSubmission/
                                         # OrgFluencyReport, reuses judge.py/chunking.py/metrics.py/
                                         # transcript_parser.py/prompts.py UNCHANGED
    tasks.py                            # MODIFY: + run_org_fluency_analysis_task (mirrors
                                         # run_fluency_analysis_task exactly)
tools/nideknil-submit/
  bin/cli.js                            # MODIFY: + --kind org|assignment flag (default: assignment)
frontend/src/
  pages/PulseDashboard.tsx              # NEW: Org Admin — create org, invite/revoke seats, team report
  pages/PulseSeatPortal.tsx              # NEW: token-based — engineer's own report (mirrors AssignmentPortal.tsx)
  App.tsx                                # MODIFY: register the two new routes
```

### Known Gotchas of our codebase & Library Quirks

```python
# CRITICAL (mount order, confirmed real bug class in this exact codebase — see main.py's existing
# comment): "/mcp" is a literal string-prefix of "/mcp/pulse" the same way it's a prefix of
# "/mcp/recruiter". BOTH more-specific mounts ("/mcp/recruiter" and the NEW "/mcp/pulse") must be
# registered BEFORE `app.mount("/mcp", candidate_mcp.streamable_http_app())`, or every /mcp/pulse/*
# request gets swallowed and 404s inside the candidate server. Verify by curling both mounts after wiring.

# CRITICAL: every FastMCP instance mounted this way needs `streamable_http_path="/"` set explicitly
# (see mcp_candidate.py line 32) — otherwise its internal route defaults to "/mcp" regardless of the
# mount prefix chosen in main.py, and it 404s once mounted at a non-root prefix.

# CRITICAL (genuine PRD correction): CHUNK_SYSTEM/AGGREGATE_SYSTEM in services/fluency/prompts.py are
# HARDCODED constants (imported directly into judge.py's concrete ABC methods, not passed as
# parameters) that describe "a candidate['s]... take-home project" and address "a recruiter." Reusing
# `get_fluency_judge()` unchanged for org submissions means the LLM's SYSTEM message still says
# "take-home"/"candidate"/"recruiter" even though the USER message (built from `assignment_brief`) will
# say "this is real on-the-job work, not a take-home." This is a real prompt inconsistency.
#   MVP DECISION (recommended, keeps this PRP's diff minimal and touches zero shared judge/prompt code):
#   accept the mismatch for MVP — craft `assignment_brief` to explicitly and forcefully reframe the
#   context (see Implementation Patterns below for the exact string), and treat cleaner system-message
#   parameterization as a v1 follow-up (add an optional `system_prompts: tuple[str,str]` param to
#   `FluencyJudge.score_chunks`/`aggregate` with a default preserving today's behavior). Do NOT silently
#   skip this tradeoff — document it in the PR description when this ships.

# CRITICAL: nideknil-submit's target URL is a hardcoded literal, NOT a configurable template (only
# `--api` origin and the positional `<token>` are parameterized today). The PRD's assumption of "zero CLI
# changes" (copied from the take-home MCP feature, where it WAS zero-change) does not hold here — a
# `--kind` flag is required (Task 9). Default it to `assignment` so every existing invocation
# (`npx nideknil-submit <token>`, no flags) is byte-for-byte unchanged.

# GOTCHA: no Alembic in this repo. All 4 new models are BRAND NEW tables → zero `_MIGRATIONS` entries
# needed, picked up automatically by `models.Base.metadata.create_all(bind=engine)` (main.py:44). Do NOT
# add unnecessary `_MIGRATIONS` entries for these — only an ALTER on an EXISTING table needs one, and this
# PRP does not alter `assignment_submissions`, `applications`, or any other existing table.

# GOTCHA: no test suite exists anywhere in this repo (zero test_*.py files, confirmed on the sibling
# MCP-apply-channel PRP and still true). Validation below is manual/integration-based, matching how
# every other feature in this codebase has actually been verified.

# GOTCHA: `OrgSeat` has NO `user_id` FK to `users` — engineers are invited by name+email only, exactly
# like `AssignmentSubmission.candidate_name`/`candidate_email` (no platform account required). Do not add
# a `user_id` FK "for consistency" — it would force engineers to have platform accounts, which the PRD's
# consent/opt-in flow does not require and the take-home flow's own candidate model doesn't require either.

# GOTCHA: `Organization.admin_user_id` ownership checks must use the SAME idiom as the rest of the
# codebase (a plain `== current_user.id` comparison via a small `_own_org(db, org_id, user) ->
# Organization` helper raising 404 on mismatch, mirroring `_own_submission` in routers/assignments.py) —
# do not invent a new capability/extension row for "org admin" in MVP; one admin per org, checked by FK
# equality, is the simplest correct thing per this PRP's explicit MVP scope.

# GOTCHA: single Uvicorn process (no --workers flag) — the reused `check_rate_limit`/
# `check_auth_failure_rate_limit` in-process dicts (services/mcp_bridge.py) are correct to reuse as-is
# for the third MCP server; do not build a Redis-backed rate limiter for MVP (that's an HLD-scale item).

# GOTCHA: engineer consent/visibility rule from the PRD (Section 8) — the Org Admin's team-report
# endpoint must return AGGREGATE/summary data only (seat name, score, status) and must NOT expose a link
# to read another seat's full report/dimensions/summary text by default. `get_my_report` (MCP tool) and
# the seat portal are the ONLY paths to a full individual report in MVP — do not add an admin-facing
# "view full report for seat X" endpoint in this PRP; that is the Section 8 consent-toggle feature,
# explicitly future work, not MVP.
```

## Implementation Blueprint

### Data models and structure

```python
# backend/models.py — 4 new classes, placed near Assignment/AssignmentSubmission/FluencyReport
# for locality (this is a sibling feature, not a modification of those classes).

class Organization(Base):
    """A company piloting AI Fluency for Engineering Teams. One admin per org in MVP —
    ownership is admin_user_id, no separate capability/extension row (see PRP Known Gotchas)."""
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    admin_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    cadence = Column(String(20), default="monthly", nullable=False)  # MVP: monthly only, validated at API layer
    created_at = Column(DateTime, server_default=func.now())

    admin = relationship("User", foreign_keys=[admin_user_id])
    seats = relationship("OrgSeat", back_populates="organization")


class OrgSeat(Base):
    """An invited engineer. No user_id FK — invited by name+email only, exactly like
    AssignmentSubmission's candidate_name/candidate_email (no platform account required)."""
    __tablename__ = "org_seats"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)

    engineer_name = Column(String(255), nullable=False)
    engineer_email = Column(String(255), nullable=False)
    mcp_key = Column(String(64), unique=True, index=True, nullable=False)  # secrets.token_urlsafe(32)

    status = Column(String(20), default="invited", nullable=False)  # invited|connected|revoked
    invited_at = Column(DateTime, server_default=func.now())
    mcp_connected_at = Column(DateTime, nullable=True)
    mcp_last_seen_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)

    organization = relationship("Organization", back_populates="seats")
    submissions = relationship("OrgSubmission", back_populates="seat")


class OrgSubmission(Base):
    """One engineer's transcript submission for one cadence period. Mirrors
    AssignmentSubmission's status machine: submitted -> processing -> analyzed | failed."""
    __tablename__ = "org_submissions"

    id = Column(Integer, primary_key=True, index=True)
    seat_id = Column(Integer, ForeignKey("org_seats.id"), nullable=False, index=True)

    period_label = Column(String(7), nullable=False)  # "YYYY-MM", computed at submit time
    status = Column(String(20), default="submitted", nullable=False, index=True)
    error = Column(Text, nullable=True)
    attempts = Column(Integer, default=0, nullable=False)

    transcript_file_keys = Column(Text, nullable=True)  # JSON list, same convention as AssignmentSubmission
    transcript_bytes = Column(Integer, nullable=True)
    session_count = Column(Integer, nullable=True)
    repo_url = Column(String(500), nullable=True)
    git_metadata = Column(Text, nullable=True)
    submit_source = Column(String(20), default="web", nullable=False)  # web | cli

    submitted_at = Column(DateTime, server_default=func.now())
    analyzed_at = Column(DateTime, nullable=True)

    seat = relationship("OrgSeat", back_populates="submissions")
    report = relationship("OrgFluencyReport", back_populates="submission", uselist=False)


class OrgFluencyReport(Base):
    """Structural mirror of FluencyReport, scoped to OrgSubmission instead of
    AssignmentSubmission. Same judge, same rubric, same field shapes — see org_pipeline.py."""
    __tablename__ = "org_fluency_reports"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("org_submissions.id"),
                           nullable=False, unique=True, index=True)

    overall_score = Column(Float, nullable=False)
    summary = Column(Text, nullable=True)
    dimensions = Column(Text, nullable=False)
    highlights = Column(Text, nullable=True)
    metrics = Column(Text, nullable=True)
    integrity_flags = Column(Text, nullable=True)
    integrity_confidence = Column(String(20), nullable=True)

    provider = Column(String(20), nullable=True)
    chunk_model = Column(String(100), nullable=True)
    aggregate_model = Column(String(100), nullable=True)
    input_tokens_est = Column(Integer, nullable=True)

    created_at = Column(DateTime, server_default=func.now())

    submission = relationship("OrgSubmission", back_populates="report")

# NO _MIGRATIONS entries needed — all 4 are new tables, auto-created via create_all().
```

### Implementation Tasks (ordered by dependencies)

```yaml
Task 1: MODIFY backend/models.py
  - IMPLEMENT: Organization, OrgSeat, OrgSubmission, OrgFluencyReport (see Data models above)
  - FOLLOW pattern: existing Column/relationship style in the Assignment/AssignmentSubmission/
    FluencyReport block immediately above where these are inserted
  - VERIFY: no `_MIGRATIONS` entry added — these are new tables (Known Gotchas)

Task 2: MODIFY backend/services/storage_service.py
  - IMPLEMENT: upload_org_transcript_file(content: bytes, org_id: int, seat_id: int,
    submission_id: int, filename: str) -> str | None
  - MIRROR: upload_transcript_file (line 152) exactly, EXCEPT the S3 key:
    f"orgs/{org_id}/{seat_id}/{submission_id}/{uuid.uuid4().hex}-{safe}"
  - DEPENDENCIES: none (sibling function, same file)

Task 3: MODIFY backend/services/fluency/store.py
  - IMPLEMENT: store_org_transcript(content: bytes, org_id: int, seat_id: int,
    submission_id: int, filename: str) -> str
  - MIRROR: store_transcript (line 31) exactly, calling storage_service.upload_org_transcript_file
    (Task 2) instead of upload_transcript_file, with local-fallback path
    Path(str(org_id)) / str(seat_id) / str(submission_id) / f"{uuid.uuid4().hex}-{_safe_name(filename)}"
    under the SAME _LOCAL_ROOT (backend/uploads/) — do not create a second local root
  - DEPENDENCIES: Task 2

Task 4: CREATE backend/services/org_bridge.py
  - IMPORT: build_transport_security, check_rate_limit, check_auth_failure_rate_limit FROM
    services/mcp_bridge.py — DO NOT duplicate these three functions
  - IMPLEMENT: mark_seat_mcp_connected(db, seat: models.OrgSeat) -> None — mirrors
    mcp_bridge.mark_mcp_connected exactly (idempotent connected_at, always-bump last_seen_at); also set
    seat.status = "connected" the first time connected_at is set
  - IMPLEMENT: issue_org_seat(db, org: models.Organization, name: str, email: str) -> models.OrgSeat —
    mirrors mcp_bridge.issue_recruiter_key, mcp_key=secrets.token_urlsafe(32)
  - IMPLEMENT: revoke_org_seat(db, seat_id: int, org: models.Organization) -> models.OrgSeat | None —
    ownership-checked (seat.organization_id == org.id), mirrors mcp_bridge.revoke_recruiter_key
  - PLACEMENT: backend/services/org_bridge.py
  - DEPENDENCIES: Task 1

Task 5: CREATE backend/services/fluency/org_pipeline.py
  - IMPORT UNCHANGED from services/fluency/: store (Task 3's store_org_transcript, plus load_transcript
    unchanged), chunking.build_chunks/enforce_budget, judge.get_fluency_judge, metrics.compute_metrics/
    compute_integrity_flags/correlate_git, transcript_parser.parse_claude_code_jsonl/TranscriptParseError
  - IMPLEMENT: dispatch_org_fluency_analysis(submission_id: int) -> str — mirrors
    pipeline.dispatch_fluency_analysis (line 64) exactly: USE_CELERY branch calling a new
    run_org_fluency_analysis_task.delay(...) (Task 6), else daemon-thread fallback calling
    execute_org_fluency_analysis directly
  - IMPLEMENT: execute_org_fluency_analysis(submission_id: int) -> None — mirrors
    pipeline.execute_fluency_analysis (line 79) exactly: same compare-and-set claim on
    models.OrgSubmission.status.in_(["submitted","failed"]) -> "processing", same
    asyncio.run(_analyze_org(...)), same idempotent-replace-then-commit into OrgFluencyReport, same
    try/except -> status="failed"/error=str(exc)[:2000] on any exception
  - IMPLEMENT: async def _analyze_org(submission: models.OrgSubmission, seat: models.OrgSeat,
    org: models.Organization) -> dict — mirrors pipeline._analyze (line 137) exactly in STRUCTURE
    (load transcripts via store.load_transcript for each key in submission.transcript_file_keys, parse,
    build_chunks/enforce_budget, judge.score_chunks then judge.aggregate, compute_metrics/
    compute_integrity_flags, _normalize_dimensions/_clamp_score-equivalent logic copied inline or
    imported if those two helpers are usable as-is from pipeline.py — check whether they take an
    AssignmentSubmission-specific type anywhere before assuming direct reuse), BUT construct the
    "assignment_brief" argument as a crafted context string instead of assignment.brief:
      f"This is NOT a take-home assignment. This is a real, on-the-job Claude Code session by a working "
      f"engineer at {org.name}. There is no fixed specification to grade against — score general "
      f"AI-collaboration quality per the rubric below, based on how the engineer actually used Claude "
      f"Code in their real work during this period."
    and pass evaluation_focus=None (no recruiter-set focus concept exists here)
  - CRITICAL: apply the MVP decision from Known Gotchas re: CHUNK_SYSTEM/AGGREGATE_SYSTEM wording —
    reuse judge.py unchanged, accept the system-message mismatch, do not fork judge.py in this PRP
  - PLACEMENT: backend/services/fluency/org_pipeline.py
  - DEPENDENCIES: Task 1, Task 3

Task 6: MODIFY backend/services/tasks.py
  - IMPLEMENT: run_org_fluency_analysis_task, mirrors run_fluency_analysis_task (line 22) exactly:
    @celery_app.task(name="run_org_fluency_analysis_task", acks_late=True) calling
    services.fluency.org_pipeline.execute_org_fluency_analysis(submission_id)
  - DEPENDENCIES: Task 5

Task 7: CREATE backend/routers/orgs.py
  - IMPLEMENT: _own_org(db, org_id, user) -> models.Organization — mirrors the ownership-check idiom of
    _own_submission in routers/assignments.py, raises HTTPException(404) on mismatch/not-found
  - IMPLEMENT: _seat_by_token(db, token) -> models.OrgSeat — mirrors _by_token (routers/assignments.py
    ~line 339) exactly, raises HTTPException(404) on unknown token or seat.revoked_at is not None
  - IMPLEMENT: POST /api/orgs (Depends(get_current_user)) -> creates Organization(admin_user_id=
    current_user.id, name=..., cadence="monthly")
  - IMPLEMENT: GET /api/orgs (Depends(get_current_user)) -> list orgs where admin_user_id == current_user.id
  - IMPLEMENT: POST /api/orgs/{org_id}/seats (Depends(get_current_user)) -> _own_org check, then
    org_bridge.issue_org_seat(...), then send an invite email (MIRROR the email-sending call pattern of
    routers/assignments.py's _send_invite_email — new function, e.g. _send_seat_invite_email, in this
    file or services/email_service.py, containing:
    "claude mcp add --transport http nideknil-pulse <MCP_PUBLIC_URL>/mcp/pulse --header "
    "\"Authorization: Bearer <mcp_key>\"" plus a one-line explanation of monthly submission cadence)
  - IMPLEMENT: GET /api/orgs/{org_id}/seats (Depends(get_current_user)) -> _own_org check, list seats with
    their LATEST OrgFluencyReport.overall_score (a live query — join OrgSeat -> OrgSubmission ->
    OrgFluencyReport, ORDER BY OrgSubmission.submitted_at DESC per seat, or simplest MVP: subquery for
    latest submission per seat) — NO caching/pre-aggregation (Known Gotchas / What's NOT in MVP)
  - IMPLEMENT: DELETE /api/orgs/{org_id}/seats/{seat_id} (Depends(get_current_user)) -> _own_org check,
    org_bridge.revoke_org_seat(...)
  - IMPLEMENT: GET /api/orgs/{org_id}/team-report (Depends(get_current_user)) -> _own_org check, returns
    aggregate-only data (avg score, count of seats by status) PLUS the per-seat list from the endpoint
    above — do NOT expose per-seat dimensions/summary here (Known Gotchas — consent boundary)
  - IMPLEMENT: GET /api/orgs/seats/portal/{token} (no auth dependency, token-based) -> _seat_by_token,
    returns the seat's own latest OrgFluencyReport in full (score, summary, dimensions, highlights) — this
    is the ONLY admin-invisible, engineer-only full-report read path besides the MCP tool
  - IMPLEMENT: POST /api/orgs/seats/portal/{token}/submit (no auth dependency, token-based,
    multipart Form/File) -> MIRROR candidate_submit (routers/assignments.py lines 373-471) structurally:
    same File(...)/Form(...) signature (files, repo_url, consent, git_metadata, submit_source), same
    per-file scrub -> parse-validate (skip unparseable, collect parse_errors) -> store_org_transcript
    (Task 3) -> on success set transcript_file_keys/transcript_bytes/session_count/repo_url/git_metadata/
    submit_source, compute period_label = current UTC month as "YYYY-MM", status="submitted",
    submitted_at=now, commit, then dispatch_org_fluency_analysis(submission.id) (Task 5)
  - PLACEMENT: backend/routers/orgs.py
  - DEPENDENCIES: Task 1, Task 4, Task 5

Task 8: CREATE backend/routers/mcp_org_seat.py
  - IMPLEMENT: mcp = FastMCP("nideknil-pulse", stateless_http=True, streamable_http_path="/",
    transport_security=build_transport_security()) — MIRROR mcp_candidate.py lines 30-35 exactly, import
    build_transport_security from services/mcp_bridge.py
  - IMPLEMENT: _authenticate(ctx: Context) -> tuple[db, seat] — MIRROR mcp_candidate.py's _authenticate
    (lines 52-78) exactly: read Authorization header from ctx.request_context.request, validate
    "Bearer <token>", look up via routers.orgs._seat_by_token(db, token) (import, do not reimplement),
    call org_bridge.mark_seat_mcp_connected(db, seat) (Task 4), same _reject/AuthError/rate-limit-on-
    failure-only pattern as mcp_candidate.py (reuse check_rate_limit/check_auth_failure_rate_limit from
    services/mcp_bridge.py)
  - IMPLEMENT tool get_org_brief(ctx: Context) -> dict — returns {org_name, cadence, seat_status,
    engineer_name}
  - IMPLEMENT tool get_submission_instructions(ctx: Context) -> str — returns:
    f"npx nideknil-submit {seat.mcp_key} --kind org\n\nor upload directly at "
    f"{settings.FRONTEND_URL}/pulse/{seat.mcp_key}"
  - IMPLEMENT tool get_my_report(ctx: Context) -> dict — calls routers.orgs.seat_view-equivalent logic
    (or import a shared helper from routers/orgs.py) to return the seat's OWN latest OrgFluencyReport
    only; return {"report": None, "message": "..."} if no analyzed submission yet, never another seat's
  - CRITICAL: never let get_my_report accept a seat_id/token parameter from the caller — it must ALWAYS
    resolve strictly from the authenticated ctx, exactly like get_assignment_brief takes no submission_id
    argument in mcp_candidate.py
  - PLACEMENT: backend/routers/mcp_org_seat.py
  - DEPENDENCIES: Task 4, Task 7

Task 9: MODIFY tools/nideknil-submit/bin/cli.js
  - IMPLEMENT: a --kind <org|assignment> CLI flag, default "assignment"
  - MODIFY: the URL construction (~line 171) to branch:
    const path = kind === "org" ? `/api/orgs/seats/portal/${token}/submit`
                                 : `/api/assignments/portal/${token}/submit`;
    const url = `${apiBase}${path}`;
  - PRESERVE: every other line (scrubBuffer call, FormData fields: files/consent/submit_source/repo_url/
    git_metadata) UNCHANGED — this is a URL-selection change only
  - VERIFY: running `node bin/cli.js <token>` with NO --kind flag produces the IDENTICAL request as today
    (regression check for the existing, shipped assignment flow)
  - PLACEMENT: tools/nideknil-submit/bin/cli.js

Task 10: MODIFY backend/main.py
  - ADD: import orgs as orgs_router (or matching existing import style), mcp_org_seat's `mcp` instance
    (aliased e.g. `as org_seat_mcp`) alongside the existing candidate_mcp/recruiter_mcp imports
  - MODIFY lifespan (lines ~467-473): add
    `await stack.enter_async_context(org_seat_mcp.session_manager.run())` inside the existing
    AsyncExitStack block
  - MODIFY mount block (lines ~519-525): insert `app.mount("/mcp/pulse",
    org_seat_mcp.streamable_http_app())` BEFORE `app.mount("/mcp", candidate_mcp.streamable_http_app())`
    — placement relative to the existing "/mcp/recruiter" mount does not matter, only that BOTH specific
    mounts precede the bare "/mcp" one (Known Gotchas)
  - ADD: `app.include_router(orgs_router.router)` after the existing last include_router call
  - PRESERVE: every other existing router/mount registration completely unchanged
  - VERIFY: no `_MIGRATIONS` entry needed (Task 1 note) — only confirm create_all() picks up the 4 new
    tables by starting the app and checking they exist in the DB
  - DEPENDENCIES: Task 7, Task 8

Task 11: CREATE frontend/src/pages/PulseSeatPortal.tsx
  - IMPLEMENT: token-based page at route /pulse/:token — MIRROR AssignmentPortal.tsx's structure (fetch
    on mount via the token in the URL, no auth header, render score/summary/dimensions or an "invited,
    not yet submitted" / "processing" state)
  - CALL: GET /api/orgs/seats/portal/{token}
  - PLACEMENT: frontend/src/pages/PulseSeatPortal.tsx

Task 12: CREATE frontend/src/pages/PulseDashboard.tsx
  - IMPLEMENT: Org Admin view (JWT-authenticated via the existing axios client) — create-org form (if the
    user has none yet), invite-seat form (name+email), seats table (name, email, status, mcp_last_seen_at,
    latest score), team-report summary block (avg score, counts by status)
  - CALL: POST/GET /api/orgs, POST /api/orgs/{id}/seats, GET /api/orgs/{id}/seats,
    DELETE /api/orgs/{id}/seats/{seat_id}, GET /api/orgs/{id}/team-report
  - PLACEMENT: frontend/src/pages/PulseDashboard.tsx

Task 13: MODIFY frontend/src/App.tsx
  - ADD: routes for /pulse/:token (PulseSeatPortal, public) and an authenticated route for
    PulseDashboard (e.g. /dashboard/pulse or similar, matching existing recruiter-area route conventions)
  - PLACEMENT: frontend/src/App.tsx
```

### Implementation Patterns & Key Details

```python
# Pattern: the crafted "brief" string that reframes the take-home-shaped prompts for real-work context
# (backend/services/fluency/org_pipeline.py) — see Known Gotchas for why this exists instead of forking
# judge.py/prompts.py.
_ORG_CONTEXT_BRIEF_TEMPLATE = (
    "This is NOT a take-home assignment. This is a real, on-the-job Claude Code session by a working "
    "engineer at {org_name}. There is no fixed specification to grade against — score general "
    "AI-collaboration quality per the rubric below, based on how the engineer actually used Claude Code "
    "in their real work during this period."
)

async def _analyze_org(submission, seat, org) -> dict:
    context_brief = _ORG_CONTEXT_BRIEF_TEMPLATE.format(org_name=org.name)
    judge = get_fluency_judge()
    # ... load + parse + build_chunks + enforce_budget, same shape as pipeline._analyze ...
    chunk_results = await judge.score_chunks(chunks, context_brief, None)
    final = await judge.aggregate(chunk_results, metrics, flags, context_brief, None)
    # ... same _normalize_dimensions/_clamp_score/persist shape as pipeline._analyze ...

# Pattern: mount order fix in main.py (the ONE line that must not be gotten wrong)
app.mount("/mcp/recruiter", recruiter_mcp.streamable_http_app())
app.mount("/mcp/pulse", org_seat_mcp.streamable_http_app())   # NEW — before the bare "/mcp" mount
app.mount("/mcp", candidate_mcp.streamable_http_app())

# Pattern: CLI --kind flag (tools/nideknil-submit/bin/cli.js), minimal diff
const kind = args.kind === 'org' ? 'org' : 'assignment';   // default preserves existing behavior
const path = kind === 'org'
  ? `/api/orgs/seats/portal/${token}/submit`
  : `/api/assignments/portal/${token}/submit`;
const url = `${apiBase}${path}`;
```

### Integration Points

```yaml
DATABASE:
  - new tables: organizations, org_seats, org_submissions, org_fluency_reports (auto-created via
    Base.metadata.create_all — no migration entries)

CONFIG:
  - NO new settings required — reuses FLUENCY_*, MCP_ALLOWED_HOSTS, USE_CELERY, S3_*, JWT_* unchanged

ROUTES:
  - app.include_router(orgs_router.router)  — /api/orgs/*
  - app.mount("/mcp/pulse", org_seat_mcp.streamable_http_app())  — BEFORE app.mount("/mcp", ...)

EMAIL:
  - new invite email (org_bridge/routers/orgs.py) containing the claude mcp add --transport http
    nideknil-pulse command — follows the existing email-sending pattern, does not touch
    _send_invite_email (that function stays scoped to the take-home flow, untouched)

FRONTEND:
  - new: PulseDashboard.tsx (Org Admin), PulseSeatPortal.tsx (engineer, token-based)
  - App.tsx registers both new routes

EXTERNAL TOOL:
  - tools/nideknil-submit — ONE new flag (--kind), default preserves 100% existing behavior
```

## Validation Loop

_No pytest/test_*.py convention exists anywhere in this repo — validation here is manual/integration-based,
matching the sibling MCP-apply-channel PRP._

### Level 1: Syntax & Style

```bash
cd backend && python -c "import main"   # confirms the app still imports cleanly with a 3rd mounted MCP server
node -c tools/nideknil-submit/bin/cli.js   # confirms the CLI still parses after the --kind addition
```

### Level 2: Component Validation (manual)

```bash
cd backend && uvicorn main:app --reload --port 8000

# Org Admin flow (use a real JWT from an existing user):
curl -s -X POST http://localhost:8000/api/orgs -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" -d '{"name":"Acme Corp","cadence":"monthly"}'
curl -s -X POST http://localhost:8000/api/orgs/<org_id>/seats -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" -d '{"engineer_name":"Dev One","engineer_email":"dev1@acme.test"}'
# Grab the mcp_key from the DB or the console-printed email fallback (services/email_service.py)

# Engineer MCP connect:
claude mcp add --transport http nideknil-pulse http://localhost:8000/mcp/pulse \
  --header "Authorization: Bearer <mcp_key>"
# In a real Claude Code session: "what's my org's cadence" -> get_org_brief
# "how do I submit" -> get_submission_instructions -> should return an npx command with --kind org
# Confirm org_seats.mcp_connected_at / mcp_last_seen_at are now set for THIS seat only
```

### Level 3: Integration Testing

```bash
# Submit via the (modified) CLI, org kind:
cd tools/nideknil-submit && node bin/cli.js <mcp_key> --kind org
# Confirm: org_submissions row created (status submitted -> processing -> analyzed), org_fluency_reports
# row populated with a real score/dimensions from the real judge call

# REGRESSION — confirm the existing take-home flow is completely unaffected:
node bin/cli.js <existing_assignment_access_token>   # no --kind flag at all
# Confirm this still POSTs to /api/assignments/portal/{token}/submit exactly as before

# Multi-tenant isolation:
# Confirm a SECOND org's admin JWT gets 404 on GET /api/orgs/<first_org_id>/seats
# Confirm a SECOND seat's mcp_key cannot get_my_report for the FIRST seat's data

# Mount-order check (the specific bug class flagged in Known Gotchas):
curl -s http://localhost:8000/mcp/pulse   # should reach the pulse server, NOT 404 inside candidate_mcp
curl -s http://localhost:8000/mcp/recruiter
curl -s http://localhost:8000/mcp
```

### Level 4: Creative & Domain-Specific Validation

```bash
# Security: malformed/missing Authorization header rejected by every tool on the new server
# Confirm get_submission_instructions never embeds transcript bytes — only ever a command/URL string
# Confirm get_my_report takes NO caller-supplied seat/submission id — always resolves from ctx only
# Read the actual org_fluency_reports.summary/dimensions produced by a real submission and sanity-check
# that the LLM did not get confused by the "take-home"-flavored system message despite the reframed
# brief (Known Gotchas tradeoff) — if scores/summary read as nonsensically hiring-flavored ("would
# recommend hiring this candidate"), that's a signal the v1 system-message parameterization should be
# pulled forward, not deferred
```

## Final Validation Checklist

### Technical Validation

- [ ] Backend starts cleanly with the THIRD mounted MCP app; `/mcp`, `/mcp/recruiter`, `/mcp/pulse` all
  resolve to their own server (no prefix-swallowing)
- [ ] All 4 new tables exist after a fresh `create_all()` run, with zero new `_MIGRATIONS` entries added
- [ ] `npx nideknil-submit <token>` (no flag) is byte-for-byte unchanged vs. before this PRP
- [ ] `npx nideknil-submit <mcp_key> --kind org` correctly reaches the new org submit endpoint

### Feature Validation

- [ ] Org Admin can create an org, invite/revoke seats, see a live team-report; cannot see another org's
- [ ] Engineer can connect via MCP, get brief/instructions/own-report tools working, never another seat's
- [ ] A real submission produces a real `OrgFluencyReport` via the UNCHANGED judge/chunking/rubric code
- [ ] Team-report endpoint exposes aggregate/summary data only — no full per-seat report leak to the admin

### Code Quality Validation

- [ ] `org_pipeline.py`/`org_bridge.py`/`routers/orgs.py`/`routers/mcp_org_seat.py` import and reuse
  `judge.py`, `chunking.py`, `metrics.py`, `transcript_parser.py`, `scrubber.py`,
  `mcp_bridge.build_transport_security/check_rate_limit/check_auth_failure_rate_limit` rather than
  duplicating any of them
- [ ] `routers/assignments.py`, `services/fluency/pipeline.py`, `services/fluency/judge.py`,
  `services/fluency/prompts.py` have ZERO diffs from this PRP (structural mirrors only, no shared-code edits)
- [ ] New models/routers follow existing naming/style conventions

### Documentation & Deployment

- [ ] The CHUNK_SYSTEM/AGGREGATE_SYSTEM wording mismatch (Known Gotchas) is called out explicitly in the
  PR description as an accepted MVP tradeoff, with the v1 fix path noted
- [ ] No new environment variables were introduced (confirm — this PRP should need none)

---

## Anti-Patterns to Avoid

- ❌ Don't fork/modify `services/fluency/{judge,prompts,chunking,metrics,transcript_parser,scrubber}.py` —
  every one of them is reused unchanged; only new orchestration code (`org_pipeline.py`) is new.
- ❌ Don't add a `user_id` FK to `OrgSeat` "for consistency" — engineers are invited by name+email only,
  mirroring `AssignmentSubmission`, and requiring a platform account contradicts the PRD's consent model.
- ❌ Don't build the HLD's pre-aggregation/rollup worker, Redis cache, or read replicas in this PRP — MVP
  is a single-org pilot; a live aggregate query is correct at this scale and those are explicit v1+ items.
- ❌ Don't let the Org Admin's team-report endpoint return a per-seat full report (dimensions/summary) —
  only `get_my_report` (MCP, seat-authenticated) and the seat portal (token-authenticated) may return that.
- ❌ Don't assume the `nideknil-submit` CLI needs zero changes — verified false for this feature; the
  `--kind` flag (Task 9) is required, defaulted for full backward compatibility.
- ❌ Don't get the `/mcp` vs `/mcp/pulse` mount order wrong — the more specific path must be registered first.
- ❌ Don't silently ship the CHUNK_SYSTEM/AGGREGATE_SYSTEM wording mismatch without documenting it — it's
  an accepted MVP tradeoff, not an oversight, and should be visible in the PR description.
