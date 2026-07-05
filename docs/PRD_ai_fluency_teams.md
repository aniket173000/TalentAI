# PRD: AI Fluency for Engineering Teams (working title: "Nideknil Pulse")

Status: Draft v1 — 2026-07-05
Owner: Aniket
Related: [[project_ai_fluency]], [[project_fluency_assignments]], [[project_mcp_apply_channel]], [[project_monetization]] (internal memory refs)

## 1. Problem

Companies are pushing engineers to use AI coding tools but have no way to measure whether that usage is
actually good — fast-but-sloppy prompting, blind accept-all of suggestions, and no verification loop look
identical to genuine productivity gains from the outside. Today the only signals leadership has are
anecdotal ("the team says Copilot/Claude is great") or output-level (velocity, PR count) which don't
distinguish AI skill from other factors. There is no product that turns a team's actual day-to-day AI
usage into an objective, coachable skill signal.

We already built exactly this analysis engine for **candidates** (take-home assignment → Claude Code
transcript → rubric-scored fluency report, see [[project_fluency_assignments]]). This PRD extends the same
core capability to **existing employees inside a company**, sold as a continuous, org-wide product rather
than a one-time hiring assignment.

## 2. Goals

- Let a company connect its engineers' Claude Code sessions (via MCP) with per-engineer opt-in.
- Capture real work sessions on a recurring cadence (not a synthetic challenge) and turn them into an
  **AI Fluency Report** per engineer: strengths, improvement areas, trend over time.
- Roll individual reports up into a **team/org view** for engineering leadership (CEO/EM/CTO).
- Create a **peer-learning loop**: surface concrete techniques from top-scoring engineers ("senior
  engineer X uses this prompting pattern for refactors") so the rest of the team can copy what works.
- Sell this as a B2B seat-based product to companies — a second product line alongside the existing
  candidate-ranking/hiring product, sharing the fluency-scoring engine underneath.

## 3. Non-goals (v1)

- Not a general engineering-productivity/velocity tool (no PR counts, cycle time, DORA metrics).
- Not tied to hiring/ranking — this is post-hire, internal, continuous. (No wiring into
  `CandidateRanking.ai_fluency_score`.)
- Not real-time/streaming monitoring — analysis runs on a cadence (weekly/monthly), not live.
- Not multi-tool in v1 — Claude Code transcripts only (matches the existing normalized `SessionEvent`
  parser-adapter design, so Cursor/Codex CLI/Aider are additive later, not a rewrite).
- Not an enforcement/performance-review system — v1 explicitly frames reports as coaching material, not
  a PIP input (see Risks — this framing is a legal/trust requirement, not a nice-to-have).

## 4. Personas

- **Org Admin** (CTO/VP Eng/Head of Platform): buys the product, invites engineers, sets the reporting
  cadence, views team-level dashboard.
- **Engineer (IC)**: connects their own Claude Code via MCP, does normal work, submits sessions on
  cadence, sees their own report — strengths, gaps, and concrete tips to improve.
- **CEO/Exec** (read-only): sees the org-level rollup — team AI-adoption trend, top performers,
  organization-wide skill gaps — without seeing raw transcripts.
- **"Model" engineer** (implicit, any high scorer): becomes a source of surfaced tips/playbook entries for
  the rest of the org — no extra action required from them beyond normal opt-in usage.

## 5. Product concept — end to end flow

1. **Company onboarding.** Org Admin signs up, creates an Organization, sets cadence (weekly or monthly),
   and invites engineers by email (reuses the seat/invite pattern already used for recruiter accounts).
2. **Engineer connects.** Invite email includes a `claude mcp add` command scoped to that engineer's own
   long-lived org-scoped token (same shape as the `RecruiterMcpApiKey` pattern in
   [[project_mcp_apply_channel]] — a static bearer key per engineer, not a JWT). Adding it wires an MCP
   server into their Claude Code.
3. **Engineer works normally.** No change to how they use Claude Code day to day.
4. **Submission trigger.** Two supported triggers in v1:
   - **Manual/cadence reminder**: end of week/month, engineer runs `npx nideknil-submit <token>` (same CLI
     already shipped for assignments — zero code changes to the CLI itself) or an MCP tool
     `submit_recent_sessions()` that returns the same command (MCP never carries file bytes — this
     constraint from [[project_mcp_apply_channel]] carries over unchanged: transcripts are large and
     image-heavy, so file transfer always stays on the direct-HTTP-upload/CLI path, never an MCP argument).
   - **Git-triggered nudge (v1.1, not MVP)**: a lightweight git `post-push`-to-main hook (installed by the
     CLI, opt-in) reminds the engineer to submit the session(s) tied to that work, rather than auto-submitting
     — auto-submission on every push is explicitly out of scope for MVP (see Risks — consent granularity).
5. **Backend analysis.** Reuses the fluency pipeline: parser → `SessionEvent` normalization → secret scrub
   → LLM judge against a rubric → per-session score + notes. New for this product: sessions are
   **aggregated per engineer per cadence period**, not scored as a single one-off assignment.
6. **Report generation.**
   - **Individual report**: strengths, improvement areas, trend line vs. their own history, and 2-3
     concrete "try this next" suggestions grounded in their actual transcripts.
   - **Team/org report**: distribution of scores, trend over time, org-wide common gaps, and a **"Playbook"**
     — short, anonymized-by-default technique snippets pulled from top-scoring sessions ("this engineer
     verified generated code with a targeted test before accepting — pattern applicable to your codebase").
7. **Distribution.** Engineer sees only their own report. Org Admin/CEO see team rollup + opt-in individual
   drill-down (see consent model, Section 8). Playbook entries are visible org-wide once the source
   engineer's identity is either anonymized or the engineer has opted to be credited (default: anonymized,
   opt-in to attribution — this mirrors "recognition without surveillance" and avoids the Section 10 risk
   of a public leaderboard chilling honest usage).

## 6. Scoring rubric

Start from the existing 8-dimension AI-collaboration rubric built for candidate assignments and adapt for
*real work* context instead of a synthetic challenge (same underlying `SessionEvent` schema, same judge
pipeline, different weighting/prompt framing since there's no "brief" to grade against — grading is about
*how* they collaborated, not whether they hit a spec):

- Prompt quality & specificity
- Context management (how well they scope/reset context, avoid bloat)
- Iteration efficiency (fewer wasted round-trips to reach a working result)
- Verification behavior (do they test/read/review before accepting — the single highest-signal dimension
  per existing calibration notes in [[project_fluency_assignments]])
- Tool-use sophistication (agentic tool use, not just chat)
- Debugging-with-AI skill (root-causing vs. trial-and-error prompting)
- Learning/adoption curve (trend improving over time — unique to this continuous product, not available
  in the one-shot assignment version)
- Judgment on when *not* to use AI (knowing when to write it by hand — avoids rewarding blind AI-maximalism)

Score is per-period per-engineer (not per-session) — a period aggregates however many sessions were
submitted in the cadence window, so one bad session doesn't dominate.

## 7. Architecture (high level — reuses existing engine)

**Reused as-is:**
- `SessionEvent` normalized transcript schema + Claude Code parser (`services/fluency/events.py`)
- Secret-scrubbing (server-side, before storage) + the JS-ported scrubber in `tools/nideknil-submit`
- LLM judge factory (`services/fluency/judge.py`) — OpenAI mainstream, Claude judge available via
  `FLUENCY_AI_PROVIDER=claude`
- S3/local-disk transcript store (`services/fluency/store.py`)
- The `npx nideknil-submit <token>` CLI — unchanged; only what a token *means* changes (org-engineer seat
  vs. assignment submission)

**New for this product:**
- `Organization` / `OrgSeat` (engineer membership) models — this product is inherently multi-tenant across
  companies, unlike the single-tenant-per-job `Assignment` flow.
- Per-engineer long-lived MCP bearer token (mirrors `RecruiterMcpApiKey` shape from
  [[project_mcp_apply_channel]] — not the one-shot `AssignmentSubmission.access_token`).
- `ReportingPeriod` (cadence window per org: weekly/monthly) and `EngineerFluencyReport` /
  `TeamFluencyReport` aggregation layer on top of the existing per-session judge output.
- `PlaybookEntry` extraction step: an additional LLM pass over top-scoring sessions that extracts a
  shareable technique snippet, with anonymization applied by default before storage.
- Org Admin dashboard (team rollup, trends, playbook feed) + Engineer self-view (own report only) —
  two new frontend surfaces; CEO view is a read-only mode of the Org Admin dashboard, not a separate app.
- MCP server variant: `submit_recent_sessions()` / `get_my_report_status()` tools scoped to the engineer's
  own seat token — same Streamable-HTTP-via-FastMCP-mounted-as-ASGI-sub-app pattern already validated for
  the candidate/recruiter MCP servers.

## 8. Privacy, consent, and trust model (this is the hard part)

This product is meaningfully riskier than the hiring version: it analyzes **real employees'** day-to-day
work, continuously, inside a company. Get this wrong and it reads as surveillance software, which kills
adoption and may be illegal in some jurisdictions (works councils, EU employee-monitoring rules).

- **Opt-in per engineer, not admin-forced.** Org Admin invites; the engineer must explicitly connect their
  own MCP and explicitly submit each period. No silent/background capture.
- **Engineer sees their own report in full; Org Admin/CEO see aggregates by default.** Individual
  drill-down for a named engineer's report requires that engineer's consent setting to allow it (default:
  off, admin sees team-level only). This is the single most important trust decision in the product —
  flip it and this becomes a monitoring tool, not a coaching tool.
- **No raw transcript access for Org Admin/CEO, ever** — only derived scores/notes/playbook snippets,
  same "scrubbed before storage" boundary already enforced for candidate transcripts.
- **Playbook anonymization default-on** — public credit is opt-in per engineer per entry.
- **Retention TTL** on raw transcripts (already a stated requirement for the candidate version in
  [[project_ai_fluency]] — carries over unchanged, arguably more important here given volume/recurrence).
- **No auto-submission tied to git pushes in MVP** — a hook that silently uploads on every push to main
  removes the consent moment on each submission; ship the reminder-only version first, revisit
  auto-submit only if customers explicitly ask and can be shown the exact upload before it's sent (matches
  the CLI's existing "show-and-confirm before sending" behavior).

## 9. Monetization

Second product line under the same value-based, INR-first, seat SaaS model as
[[project_monetization]]/[[project_ai_fluency]], sold to the *company* (Org Admin), not the individual
engineer:

- Per-seat pricing (per engineer with an active connected MCP), tiered by seat count.
- Illustrative: Starter (up to 10 seats, monthly cadence only) ~₹X/seat/mo; Growth (up to 50 seats, weekly
  cadence, team dashboard + Playbook) ~₹Y/seat/mo; Enterprise (unlimited, SSO, custom rubric weighting,
  data-residency controls) custom pricing.
- Trial: free for first N seats / first cadence period, to let the org see a real report before paying —
  same PLG land-and-expand shape used elsewhere in the product.
- Cost basis: same per-session LLM judge cost already measured for assignments (~$0.10-ish range per
  session depending on model/budget ladder) — high gross margin holds at this volume too, but *volume* is
  much higher than hiring (every engineer, every period, indefinitely, vs. once per candidate) — cost
  model needs re-validating at scale, not just re-using the hiring-product unit economics as-is.

## 10. Risks

- **Trust/adoption risk**: if it feels like surveillance, engineers disengage or game submissions
  (cherry-pick their best session). Mitigated by the consent model in Section 8, but this is the top
  product risk, not an edge case — worth a design partner pilot with explicit engineer buy-in before
  wider rollout.
- **Gaming the metric**: once engineers know what's scored, they can perform for the score rather than
  work normally (Goodhart's law). Rotating/undisclosed rubric weighting and periodic recalibration against
  hand-scored samples (same calibration gap already open in [[project_fluency_assignments]]) mitigate but
  don't eliminate this.
- **IP/code leakage**: transcripts contain real proprietary code, not a throwaway take-home problem.
  Scrubbing must go beyond secrets (API keys) to also support customer-controlled redaction rules
  (e.g. strip file contents, keep only prompts/tool-call metadata) — likely an Enterprise-tier requirement,
  not v1.
- **Public-ranking morale risk**: even anonymized, a visible score distribution can demotivate the bottom
  of the curve. Frame reports as "areas to grow" not "you rank #8/12" — no forced leaderboard in v1.
- **Legal/compliance**: employee-monitoring disclosure requirements vary by country (notably EU/works
  councils). Needs a legal review before selling into regulated markets — flagged here, not resolved.

## 11. Success metrics (v1 pilot)

- % of invited engineers who connect MCP and submit at least once in the first cadence period (adoption).
- % who submit in 2+ consecutive periods (retention — the leading indicator this isn't just novelty).
- Org Admin qualitative feedback: "would you act on this report" (coaching usefulness, not just noise).
- At least one Playbook entry per pilot org that an engineer other than the source reports actually trying.

## 12. Phased rollout

- **MVP**: single-org pilot, manual submission only (no git hook), individual + team report, no Playbook
  yet, OpenAI judge only, monthly cadence.
- **v1**: Playbook extraction + org-wide feed, weekly cadence option, engineer consent toggle for
  individual drill-down, Claude judge switch.
- **v1.1**: git post-push reminder (opt-in), customer-controlled redaction rules (Enterprise).
- **v2**: multi-tool parser adapters (Cursor/Codex CLI/Aider) onto the same `SessionEvent` schema, custom
  per-org rubric weighting, benchmarking across anonymized org cohorts ("how does our team compare to
  similar-size eng orgs") as a premium analytics add-on.

## 13. Open questions

- Does the CEO/Exec view need to be a distinct role from Org Admin, or is "read-only mode of Org Admin"
  sufficient for v1? (assumed sufficient above — revisit if pilot customers push back)
- Where does this live relative to the existing recruiter/candidate product in the UI/account model — same
  Nideknil account with a second product tab, or a separate SKU/login? (affects Section 7's `Organization`
  model — may be able to reuse the existing company/account model instead of a new one; needs a look at
  the current `models.py` company/org shape before finalizing schema)
- Auto-expire seats when an engineer leaves the company (offboarding hook) — not addressed above, needs an
  Org Admin "remove seat" action at minimum for v1.
- Minimum session volume per period before a report is meaningful (avoid over-indexing on a single short
  session) — needs a floor, TBD during pilot calibration.
