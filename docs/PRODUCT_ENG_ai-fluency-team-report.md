# Product-Engineering Doc — AI Fluency Team Report ("Nideknil Pulse")

Status: Draft v1 — 2026-07-28
Owner: Aniket
Feature slug: `ai-fluency-team-report`
Related: `docs/PRD_ai_fluency_teams.md`, `docs/HLD_ai_fluency_teams_architecture.md`, existing engine `services/fluency/*`, CLI `tools/nideknil-submit`

> This doc is the **product⇄engineering intersection**. It assumes the PRD's *why*
> and focuses on the *what/how* we ship in this repo, grounded in code that
> already exists. Phase-3 gate decisions are recorded in §8 so they aren't
> re-litigated.

---

## 0. TL;DR

We are turning our existing **candidate** AI-fluency scoring engine into a
**continuous, team-wide product for startups**: engineers connect Claude Code
once, their daily sessions flow in (`npx nideknil-submit` / MCP / web), and each
period we produce a per-engineer fluency report **and** a **Team AI Fluency
Report** — team index, per-dimension gaps, trend over time, an opt-in
leaderboard, and an anonymized **Playbook** that mines transferable techniques
from top performers so the rest of the team copies what works. Sold per-seat to
startups. **Headline metric:** team fluency index trending up period-over-period,
with ≥1 Playbook technique adopted by someone other than its author per period.

The leverage: **~80% of the engine already exists** (`services/fluency/`, the
`nideknil-submit` CLI, the S3/local store, the OpenAI/Claude judge). This feature
is the *team layer*: multi-tenant org/seat model, a brief-free scoring mode,
period aggregation, the Playbook extractor, and two dashboards.

## 1. Problem (cleaned)

Startups push "AI-first" working but have **zero objective visibility** into
whether people actually use AI *well*. Fast-but-sloppy prompting, blind
accept-all, and no verification loop look identical to real productivity from the
outside. The only signals leadership has are vibes and output-level proxies (PR
count, velocity) that don't isolate *AI skill*. The painful workaround is
manual: skim Slack, eyeball PRs, guess. **Cost of not solving:** AI enablement
budget spent blind, the best AI-users' habits stay invisible and un-replicated,
and leaders can't prove adoption/ROI to their board.

## 2. Goal & Non-goals

- **Goal:** Convert a team's real Claude Code sessions into an objective,
  coachable, per-period **team fluency signal** that measurably improves — with a
  peer-learning Playbook that spreads the best techniques. Monetized per-seat.
- **Non-goals (v1):**
  - Not a velocity/DORA tool (no PR counts, cycle time).
  - Not hiring/ranking — this is post-hire, internal, continuous.
  - Not real-time monitoring — analysis runs per cadence (weekly/monthly).
  - Not multi-tool — Claude Code transcripts only (adapter-extensible later).
  - Not a performance-review/PIP input — framed as coaching (trust requirement).
  - No **forced** leaderboard — leaderboard/attribution is opt-in only.

## 3. End customers & the problem we solve for each

Ranked by likelihood-to-pay (cross-referenced by the finance doc).

| Segment | Job-to-be-done | Pain today | How this feature solves it |
|---|---|---|---|
| **Seed–Series-B startup eng leader (CTO/VP Eng)** — *primary buyer* | Prove AI adoption is real & improving; spend enablement budget where it moves the needle | Only vibes + velocity proxies; can't see *how* the team uses AI | Team index + per-dimension gap heatmap + trend; buys seats |
| **AI-forward startup founder/CEO** | Show the board "we are genuinely AI-native" | No defensible metric to point at | Org rollup trend + adoption %, read-only exec view |
| **Eng manager / team lead** | Coach ICs on where to improve, spread what works | No exemplar to point juniors at; coaching is generic | Per-engineer coaching tips + Playbook of real team techniques |
| **The IC engineer** | Level up AI skills, get recognized | No feedback loop; good habits invisible | Own report + "try this next" tips; opt-in credit in Playbook |
| **Dev-tool / AI-consultancy (reseller, later)** | Offer "AI maturity" as a service to their clients | Nothing to instrument it with | Multi-org, white-labelable engine (v2) |

## 4. Product experience

**Happy path (engineer, IC):**
1. Gets an invite email → clicks → lands on a consent screen (what's captured,
   what the admin can/can't see). Explicitly opts in.
2. Runs one setup command: `claude mcp add nideknil-pulse … <seat-token>` (or
   just `npx nideknil-submit <seat-token>` at period end). Zero change to daily work.
3. At period end: the CLI/MCP tool shows exactly which sessions will be sent,
   scrubs secrets locally, asks to confirm → uploads. Web drag-drop is the fallback.
4. Sees **their own** report: overall + 8 dimensions, trend vs. their own history,
   1–2 concrete "next skill" tips grounded in their transcripts.

**Happy path (org admin / CTO):**
1. Sign up → create Organization → pick cadence (weekly/monthly) → invite by email.
2. Watch seats connect (adoption %). At period end, open the **Team AI Fluency
   Report**: team index, dimension averages, gap heatmap, trend line, opt-in
   leaderboard, and the **Playbook feed**. Never sees raw transcripts; sees named
   individual drill-down only for engineers who opted in.

**API-facing surfaces:** REST under `/api/pulse/*` and `/api/orgs/*`; a per-seat
bearer-auth ingestion endpoint; an MCP server mounted at `/mcp-pulse`.

**`[AI-added]` (beyond the raw ask), each rejectable:**
- **Playbook extractor** — LLM pass over top-scoring sessions → transferable,
  anonymized-by-default technique snippets. *This is the "others learn from
  AI-first employees" promise made real.*
- **Personalized coaching nudge** — per-engineer "next skill" from weakest dimension.
- **Fluency trend + momentum** (improving/declining), not just a static number.
- **Team gap heatmap** — the team's collective weak dimension → targets enablement.
- **Weekly manager digest** — auto summary email of movement + who improved most.
- **Consent/anonymization guardrails** baked into the data model (not bolted on).

**Success criteria (measurable):**
- [ ] Engineer can go invite → connect → submit → see own report with no eng help.
- [ ] Team report renders index, 8 dimension averages, trend, gap heatmap, Playbook.
- [ ] Admin cannot access any raw transcript or a non-consenting engineer's report.
- [ ] Brief-free scoring produces sane dimension scores on a real Claude Code log.
- [ ] Per-seat limit is enforced on invite (billing scaffold).

## 5. Engineering design (the "how")

### 5.1 Architecture / HLD

Reuse the proven pattern: FastAPI routers → services → SQLAlchemy models →
Celery/thread dispatch → OpenAI/Claude judge → JSON-column reports. New code is a
thin **team layer** over the existing `services/fluency` engine.

```
                       ┌─────────────────────────────────────────────┐
  Claude Code  ──MCP──▶ /mcp-pulse  (submit_recent_sessions,          │
  (engineer)           │             get_my_report_status)            │
      │  npx submit ───▶ POST /api/pulse/submit  (seat bearer token)  │
      │  web upload ───▶ POST /api/pulse/submit  (multipart)          │
      └────────────────▶ scrub (server) ─▶ store (S3/local) ─▶ dispatch│
                        └──────────────────────────┬──────────────────┘
                                                    ▼
                      services/pulse/pipeline  (REUSES services/fluency:
                        parse → metrics → integrity → judge[general-work])
                                                    ▼
                        PulseSubmission → PulseReport (per seat per period)
                                                    ▼
       services/pulse/aggregation  ─▶ TeamReport (index, dim avgs, trend, heatmap)
       services/pulse/playbook     ─▶ PlaybookEntry[] (anonymized-by-default)
                                                    ▼
   GET /api/orgs/{id}/dashboard, /playbook   GET /api/pulse/me/report
        (org admin / exec, aggregates)            (engineer, own only)
```

**Framework choices & why:** FastAPI + Pydantic + SQLAlchemy 2.0 + Celery/Redis —
the repo's stack; the MCP server reuses the Streamable-HTTP-FastMCP-mounted-as-
ASGI-subapp pattern already validated for `/mcp` and `/mcp-recruiter`. JSON text
columns for evolving report shapes (same convention as `FluencyReport`,
`Job.jd_requirements`) so the report schema evolves without migrations.

### 5.2 Data model (new tables in `backend/models.py`)

Multi-tenant (this product spans many companies, unlike single-tenant per-Job
`Assignment`). All money/consent/offboard concerns are first-class columns.

- **`Organization`** — `id, name, admin_user_id→users, cadence('weekly'|'monthly'),
  plan('trial'|'starter'|'growth'|'enterprise'), seats_limit, region('IN'|'US'),
  trial_ends_at, created_at`.
- **`OrgSeat`** — one engineer's membership. `id, org_id, user_id(nullable until
  accepted), email, full_name, role('admin'|'engineer'|'exec'),
  status('invited'|'active'|'revoked'), mcp_token(unique, long-lived bearer —
  mirrors RecruiterMcpApiKey), share_individual_report(bool, default False),
  playbook_attribution(bool, default False), invited_at, connected_at,
  last_seen_at, revoked_at`. Consent lives here → the trust model is enforced in data.
- **`ReportingPeriod`** — `id, org_id, label('2026-W30'|'2026-07'), cadence,
  starts_at, ends_at, status('open'|'closed')`.
- **`PulseSubmission`** — a seat's bundle of sessions for a period (maps 1:1 onto
  the existing "many transcript files → one report" pipeline). `id, org_id,
  seat_id, period_id, status('submitted'|'processing'|'analyzed'|'failed'),
  transcript_file_keys(JSON), git_metadata(JSON), submit_source('cli'|'web'|'mcp'),
  work_note(optional light context), transcript_bytes, session_count, attempts,
  error, submitted_at, analyzed_at`. Status machine + compare-and-set claim copied
  from `AssignmentSubmission`/fluency pipeline.
- **`PulseReport`** — per submission (== per seat per period). Same shape as
  `FluencyReport` (`overall_score, summary, dimensions(JSON), highlights, metrics,
  integrity_flags, integrity_confidence, provider, chunk_model, aggregate_model,
  input_tokens_est`) + `seat_id, period_id` for aggregation queries. Separate table
  from `FluencyReport` to keep the hiring product and this product decoupled.
- **`TeamReport`** — org rollup per period. `id, org_id, period_id, seats_reporting,
  team_index(float), dimension_averages(JSON), trend(JSON), gap_heatmap(JSON),
  created_at`.
- **`PlaybookEntry`** — `id, org_id, period_id, source_seat_id(nullable),
  dimension_key, technique(text), evidence(scrubbed snippet), anonymized(bool
  default True), attributed_name(nullable), created_at`.

Migrations: additive new tables only — no changes to existing tables → safe.

### 5.3 APIs / contracts

Auth: `require_org_admin` (JWT + admin seat), `require_seat_bearer` (static
`mcp_token`), `require_current_user` (engineer self-view). Error shape: existing
`HTTPException` JSON `{detail}`.

**Org admin (JWT):**
- `POST /api/orgs` — create org `{name, cadence, region}` → org.
- `POST /api/orgs/{id}/seats` — invite `{emails[]}` → mints seat + `mcp_token`,
  sends invite email. **Enforces `seats_limit`** (402 when exceeded).
- `DELETE /api/orgs/{id}/seats/{seat_id}` — offboard (revoke; keeps derived report,
  drops token).
- `PATCH /api/orgs/{id}` — cadence/plan.
- `GET /api/orgs/{id}/dashboard?period=` → `{team_index, dimension_averages,
  trend[], gap_heatmap, adoption, leaderboard(opt-in only)}`. Never raw transcripts.
- `GET /api/orgs/{id}/playbook?period=` → `PlaybookEntry[]`.
- `GET /api/orgs/{id}/seats/{seat_id}/report` → 403 unless
  `share_individual_report` is set by that engineer.

**Engineer:**
- `GET /api/pulse/portal/{token}` — consent screen data + connect instructions.
- `POST /api/pulse/portal/{token}/consent` — opt-in + set consent toggles.
- `GET /api/pulse/me/report?period=` — own report (JWT or seat token).
- `PATCH /api/pulse/me/consent` — flip `share_individual_report`, `playbook_attribution`.

**Ingestion (seat bearer):**
- `POST /api/pulse/submit` — multipart transcript files (+ optional `work_note`,
  `git_metadata`). Server-side scrub → store → upsert `PulseSubmission` for the
  current open period → `dispatch_pulse_analysis`. Reuses
  `scrub_transcript_bytes`, `store.store_transcript`, the CLI's show-and-confirm.

**MCP (`/mcp-pulse`, seat token):** `submit_recent_sessions()` returns the exact
`npx` command (MCP never carries file bytes — large/image-heavy, stays on HTTP),
`get_my_report_status()` returns latest period status/score.

### 5.4 Services / core logic (SOLID — one reason to change each)

- `services/pulse/pipeline.py` — `dispatch_pulse_analysis(submission_id)` +
  `execute_pulse_analysis`. **Delegates** to the fluency engine in *general-work
  mode* (`brief=None`). Single responsibility: orchestrate one submission's analysis.
- `services/fluency/prompts.py` — add a **general-work** system/prompt variant
  (versioned constant) selected when no brief is present; hiring prompts untouched
  (Open/Closed — extend, don't modify). Same 8-dimension `RUBRIC`.
- `services/pulse/aggregation.py` — `TeamReportBuilder`: pure function over the
  period's `PulseReport`s → team index (mean of overalls), per-dimension averages,
  trend (this period vs. prior `TeamReport`s), gap heatmap (lowest dimensions),
  opt-in leaderboard. Deterministic, no LLM → cheap, cacheable.
- `services/pulse/playbook.py` — `PlaybookExtractor`: one extra LLM pass over the
  top-K sessions' highlights → transferable technique snippets; anonymize unless
  `playbook_attribution`. Retries/timeouts/structured-JSON via the existing judge
  helper (`_complete_json`, `_parse_json_reply`).
- `services/pulse/periods.py` — `resolve_open_period(org)` / period rollover.
- `services/pulse/billing.py` — plan catalog (IN + US tiers), `enforce_seat_limit`,
  `plan_features`. Strategy over region; Razorpay fields already on `User`.

AI wiring: reuse `get_fluency_judge()` (OpenAI mainstream, Claude via
`FLUENCY_AI_PROVIDER=claude`), `enforce_budget`/`build_chunks`, the LLM cache, and
the concurrency semaphore. New `PULSE_*` settings mirror `FLUENCY_*`.

### 5.5 Sequence (primary flow)

```
npx nideknil-submit <seat-token>
  → discover project sessions, capture git, scrub locally, confirm
  → POST /api/pulse/submit (multipart, bearer=seat_token)
      → server scrub (defense in depth) → store.store_transcript (S3/local)
      → upsert PulseSubmission(period=open, status=submitted)
      → dispatch_pulse_analysis  (Celery if USE_CELERY else thread)
          → compare-and-set submitted→processing (exactly-once)
          → parse → compute_metrics → integrity_flags → correlate_git
          → judge.score_chunks(brief=None, general-work) → judge.aggregate
          → PulseReport(overall, dimensions, ...)  status→analyzed
  → (on period close) TeamReportBuilder → TeamReport
                      PlaybookExtractor  → PlaybookEntry[]
Engineer GET /api/pulse/me/report ; Admin GET /api/orgs/{id}/dashboard
```

### 5.6 Non-functional

- **Scalability:** write path is async (dispatch → worker), read path serves
  precomputed `TeamReport`/`PlaybookEntry` rows (no fan-out aggregation at request
  time) → dashboard is O(1) reads. Judge runs chunk-concurrent under a semaphore.
  Matches HLD §4 targets.
- **Cost per use:** ~$0.10-ish per session judged (existing measured range) × the
  Playbook pass per period. Metered per seat; see finance doc COGS.
- **Idempotency:** compare-and-set status claim; report persist deletes-then-inserts
  (copied from fluency pipeline) → retries never double-count.
- **Observability:** `_log_report_summary`-style non-sensitive log line per run.
- **Failure handling:** per-chunk tolerance (one 500 doesn't kill a 40-session
  submission); failed submissions are retryable; broker-down degrades to thread.
- **Security/privacy:** secrets scrubbed before storage; admin never touches raw
  transcripts; seat token is revocable; consent gates individual drill-down.

## 6. Intersection decisions (product ⇄ engineering trade-offs)

1. **Consent is a data-model column, not app logic.** Product needs "transparency
   without surveillance"; engineering enforces it by making `share_individual_report`
   a column checked in the auth guard, so no endpoint can accidentally leak.
2. **Brief-free mode = extend prompts, not fork the engine.** Product wants
   frictionless daily submission (no project spec); engineering adds a prompt
   variant + `brief=None` path so hiring mode stays byte-identical (Open/Closed).
3. **Period = a "bundle submission", reusing the many-files→one-report pipeline.**
   Product wants per-period (not per-session) scoring so one bad session doesn't
   dominate; the existing pipeline already aggregates multiple files → we get it free.
4. **Precompute team rollups at period close.** Product wants an instant dashboard
   at 1k concurrent admins (HLD §4.2); engineering trades a little write-time work
   (build `TeamReport` once) for O(1) reads instead of live aggregation.
5. **MCP carries commands, never files.** Product wants "auto-fetch"; engineering
   keeps large/image-heavy transcript bytes on the HTTP/CLI path and uses MCP only
   to trigger + report status (constraint carried from the apply channel).
6. **New `PulseReport` table vs. reusing `FluencyReport`.** Chose separate tables:
   decouples the hiring and team products so either can evolve its schema without
   risking the other, at the cost of a little duplication.

## 7. Future scenarios & extensibility

1. **Multi-tool (Cursor/Codex CLI/Aider).** Already cheap: everything runs on the
   normalized `ParsedSession`/`EventKind` schema — add a parser adapter, no rewrite.
2. **Custom per-org rubric weighting + benchmarking across anonymized org cohorts**
   ("how does our team compare to similar startups") — a premium analytics add-on;
   `RUBRIC` weights are already data, and reports are already JSON.
3. **Git post-push reminder (opt-in) + Enterprise redaction rules** (strip file
   contents, keep prompt/tool metadata) — the CLI already has show-and-confirm and
   a scrubber to extend.
4. **Auto-offboarding hook** when an engineer leaves — `DELETE seat` already
   revokes the token and keeps derived reports.
5. **Claude judge switch** — `ClaudeFluencyJudge` is fully implemented; flip
   `FLUENCY_AI_PROVIDER=claude` when credits land, zero code change.

## 8. Risks & open questions

- **Surveillance perception (top risk).** Mitigated by opt-in-per-engineer,
  aggregates-by-default, no raw-transcript access, anonymized Playbook. → *Decision
  (Phase-3 gate): consent-first, aggregates + opt-in leaderboard.*
- **Gaming the metric (Goodhart).** Mitigated by per-period aggregation +
  periodic recalibration; not fully solvable — documented.
- **IP/code leakage** — real proprietary code in transcripts; secrets scrubbed
  today, content-redaction rules are an Enterprise v1.1 item.
- **Legal/compliance** (EU works-councils / monitoring disclosure) — needs legal
  review before regulated markets; flagged, not resolved.
- **Resolved at gate:** scoring = brief-free general-work rubric; ingestion =
  CLI + MCP auto-connect + web; build scope = full backend + minimal frontend view.

## 9. Rollout

- **Flags/config:** `PULSE_ENABLED`, `PULSE_*` model/budget settings mirroring
  `FLUENCY_*`; `USE_CELERY` reused.
- **Migration:** additive tables only; `Base.metadata.create_all` in dev, Alembic
  in prod. No backfill.
- **Phased:** MVP = single-org pilot, manual submit, monthly cadence, OpenAI judge,
  individual + team report (no Playbook) → v1 adds Playbook + weekly cadence +
  consent toggle + Claude switch.
- **Metrics to watch:** connect+submit adoption %, 2+ period retention, "would you
  act on this report" qualitative, ≥1 adopted Playbook technique/period.
- **Rollback:** feature flag off + drop routers; new tables are inert to the
  hiring product.

## 10. Shipped

Built end-to-end in the FastAPI backend + React frontend, reusing the existing
`services/fluency/*` engine. Dev-tested against a temp sqlite DB with the LLM
judge stubbed (real parse → metrics → chunking → normalize → aggregation →
playbook → dashboard exercised).

**Data model — `backend/models.py` (7 additive tables, no existing table changed):**
- `Organization` (multi-tenant company; `region` drives pricing, `plan`/`seats_limit` gate billing)
- `OrgSeat` (engineer membership; revocable `seat_token` bearer; consent flags `share_individual_report`, `playbook_attribution`)
- `ReportingPeriod` (weekly/monthly cadence window)
- `PulseSubmission` (a seat's session bundle per period; compare-and-set status machine)
- `PulseReport` (per-engineer scored output; same JSON-column shape as `FluencyReport`)
- `TeamReport` (precomputed org rollup — O(1) dashboard reads)
- `PlaybookEntry` (mined technique; anonymized unless attribution opted in)

**Services — `backend/services/pulse/`:**
- `pipeline.py` — `dispatch_pulse_analysis` / `execute_pulse_analysis`; delegates to the fluency engine in brief-free general-work mode, exactly-once via compare-and-set.
- `aggregation.py` — `TeamReportBuilder`: team index, dimension averages, gap heatmap (weakest-first), trend; pure/no-LLM.
- `playbook.py` — `PlaybookExtractor`: one LLM pass over top-K sessions → transferable techniques, consent-aware anonymization.
- `periods.py` — get-or-create open period; weekly (`YYYY-Www`) / monthly (`YYYY-MM`) windows.
- `billing.py` — dual-market plan catalog (IN/US), `enforce_seat_limit` (402), `plan_allows_weekly`.
- `store.py` — pulse-prefixed S3/local transcript store with its own local read path.

**Engine changes (extend, not modify — hiring path byte-identical):**
- `services/fluency/prompts.py` — added `GENERAL_WORK_*` systems + `_build_general_*` builders; `general_work=False` default.
- `services/fluency/judge.py` — threaded `general_work` through `score_chunk/score_chunks/aggregate`.
- `services/storage_service.py` — added `upload_pulse_transcript_file` (+ shared `_put_transcript`).

**APIs — `backend/routers/pulse.py` (17 endpoints under `/api/pulse`):** org CRUD, seat invite/list/offboard, dashboard, playbook, close-period, consent-gated seat report, engineer portal + consent + own report, seat-bearer `POST /portal/{token}/submit`, public `/plans`. MCP server `backend/routers/mcp_pulse.py` mounted at `/mcp-pulse` (`get_my_report_status`, `submit_recent_sessions` — commands only, never file bytes). Celery task `run_pulse_analysis_task` in `services/tasks.py`. Registered in `main.py`.

**Config — `config.py`:** `PULSE_ENABLED`, `PULSE_MCP_PUBLIC_URL`, `PULSE_PLAYBOOK_TOP_K`, `PULSE_MIN_SESSIONS_FOR_REPORT`, `PULSE_TRIAL_SEATS`.

**Schemas — `schemas.py`:** `OrgCreate/Response`, `SeatInvite*`, `SeatResponse`, `ConsentUpdate`, `PulseReportResponse`, `PulsePortalView`, `TeamDashboardResponse`, `LeaderboardEntry`, `PlaybookEntryResponse`, `PlanResponse`.

**CLI — `tools/nideknil-submit`:** added `--pulse` (routes to `/api/pulse/portal/{token}/submit`) and `--note`; same show-and-confirm + local scrub contract.

**Frontend — React:** `api/pulse.ts` client; `pages/TeamPulseDashboard.tsx` (admin: create org, invite/offboard seats, team index, gap heatmap, trend, opt-in leaderboard, Playbook, close-period); `pages/PulsePortal.tsx` (engineer consent + setup commands + own report with coaching tips). Routes `/recruiter/pulse` (recruiter-gated) and `/pulse/portal/:token` (public). `tsc --noEmit` → 0 errors.

**Dev-test results (22 checks):**
- Happy path: create org → invite → portal → consent → submit real transcript → analysis produced a `PulseReport` (8 dims) → close-period built team rollup + Playbook → dashboard/leaderboard/playbook served. ✅
- Overall correctly **recomputed deterministically** (76.2 from weighted dims, ignoring the LLM's self-reported number) — verified as intended behavior, not a bug.
- Edge cases: non-transcript file → **400**; seat limit exceeded → **402**; admin viewing a non-consenting engineer's report → **403**; revoked seat token → **404**. ✅
- Judge called in `general_work=True` mode (asserted), confirming hiring mode is untouched.

**Post-build follow-ups (live-server verified):**
- **Nav link:** added a recruiter-gated "Pulse" link to `frontend/src/components/Navbar.tsx` (`/recruiter/pulse`).
- **Scheduled rollover:** `pulse_period_rollover_task` (`services/tasks.py`) closes every open period whose window has ended (builds rollup + Playbook); idempotent. Registered on an hourly Celery beat schedule in `celery_app.py`.
- **Live curl run** against a real `uvicorn main:app` (temp sqlite): dev-login → create org → invite → portal → consent → dashboard → plans all returned correctly; live seat-limit → **402**; live ingestion parsed a real transcript and reached the judge (failed only on the absent `OPENAI_API_KEY`, as expected).
- **Bug found & fixed in live test:** the Pulse MCP server 500'd on connect — its session-manager task group wasn't started because `main.py`'s lifespan ran only the candidate/recruiter managers. Added `pulse_mcp.session_manager.run()` to the lifespan `AsyncExitStack`; all three MCP servers now return the correct 406 on a bare GET. **Takeaway:** every FastMCP sub-app mounted via `streamable_http_app()` must also have its `session_manager.run()` entered in the parent lifespan — mounting alone is insufficient.
