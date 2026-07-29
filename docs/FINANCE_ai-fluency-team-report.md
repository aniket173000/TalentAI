# Finance & Monetization Doc — AI Fluency Team Report ("Nideknil Pulse")

Status: Draft v1 — 2026-07-28
Owner: Aniket
Feature slug: `ai-fluency-team-report`
Cross-ref: `docs/PRODUCT_ENG_ai-fluency-team-report.md` §3 (end customers)

> Written as a CxO with a revenue target who has to actually sell this. Sold to
> the **company** (org admin), not the individual engineer. Seat-based SaaS,
> INR-first for India and value-anchored for the US — two separate strategies,
> not a currency conversion. `Organization.region` in the data model decides
> which price list applies, so this is enforceable in code, not just a slide.

---

## 1. Who actually buys this (ICPs, ranked)

Ranked by **likelihood-to-pay × deal size**. User (engineer) ≠ buyer (eng leader).

| Buyer (ICP) | Why they pay | Budget owner | Deal size band | Objection |
|---|---|---|---|---|
| **Seed–Series-B startup eng leader (CTO/VP Eng), 10–80 engineers** — *primary* | Prove AI adoption is real & improving; spend enablement budget where it moves the needle; board-defensible metric | CTO / VP Eng (own tools budget) | IN ₹5k–30k/mo · US $300–2,500/mo | "Feels like surveillance" / "will my engineers game it" |
| **AI-forward founder/CEO (pre-Series-B, <15 eng)** | Wants a hard "we're genuinely AI-native" number for the board/investors | Founder | IN ₹1.5k–6k/mo · US $150–600/mo | Small team, may DIY |
| **Series-B+ / scale-up Head of Eng Enablement or DevEx** | Owns a real enablement budget; needs to target training spend | DevEx/Platform lead | IN ₹30k–1L/mo · US $2.5k–15k/mo | Procurement + security review, data-residency |
| **Dev-tool vendor / AI consultancy (reseller)** — *later* | Offer "AI maturity scoring" to their own clients | Partnerships | Rev-share / platform fee | Needs white-label + multi-org (v2) |
| **Enterprise (500+ eng)** — *not v1* | Governance, ROI reporting on AI spend | VP Eng + Security | $30k+/yr | Works-council/legal, custom redaction |

**Won't pay (be honest):** solo devs and <5-person teams — no team to compare,
no enablement budget. They're free-tier fuel, not revenue.

## 2. Value & willingness-to-pay logic

Anchor to the value of the engineer, not to our token cost.

- A US engineer costs **~$140k–180k/yr** fully loaded; an Indian engineer
  **~₹20–40L/yr**. A credible **5% effective-productivity uplift** from better AI
  usage is worth **~$7k–9k/engineer/yr (US)** and **~₹1–2L/engineer/yr (India)**.
- We capture a *tiny fraction* of that: **US ~$180–350/engineer/yr**, **India
  ~₹3.6k–12k/engineer/yr**. ROI story = "one avoided week of thrash per engineer
  per year pays for the whole seat several times over."
- The Playbook adds a second value axis: it doesn't just measure, it **spreads the
  best technique across the team** — that's the line that turns "nice dashboard"
  into "this made my median engineer better," which is what actually renews.

## 3. Packaging

- **Model:** per-seat SaaS, billed monthly/annual, sold to the org. A **seat** =
  an engineer with an active connected MCP/CLI token (`OrgSeat.status='active'`).
- **Metering unit:** **active seat per period.** Cadence (weekly vs monthly) is a
  plan lever — weekly costs us ~4× the LLM spend, so it sits in higher tiers.
- **Free tier (PLG land):** first **5 seats free for the first cadence period** —
  the org sees a *real* team report before paying (land-and-expand). No card to start.
- **Add-ons:** Playbook + benchmarking as a Growth+ feature; annual = 2 months free.

## 4. India pricing strategy (₹, INR-first)

Indian eng-tool budgets are tight and monthly-friendly; anchor low, convert on
value, expand by seats. Psychological points that close: **₹299 / ₹599 / ₹999**.

| Tier | Seats | Cadence | Key features | Price |
|---|---|---|---|---|
| **Free trial** | up to 5 | 1 period | Individual + team report | ₹0 |
| **Starter** | up to 10 | Monthly | Individual + team report, trend | **₹299/seat/mo** |
| **Growth** | up to 50 | Weekly | + Playbook, gap heatmap, manager digest, opt-in leaderboard | **₹599/seat/mo** |
| **Enterprise** | 50+ | Weekly/custom | + SSO, custom rubric weights, data-residency, redaction rules, priority judge | **₹999+/seat/mo (custom)** |

Annual: **2 months free** (₹599 → ~₹5,990/yr). Why it converts here: monthly cash
terms, sub-₹1k anchors that a founder approves without procurement, and a free
first period that removes "will it even work for us" risk. A 30-engineer Growth
org = **₹17,970/mo (~₹2.15L/yr)** — a comfortable startup tools line item.

## 5. US pricing strategy ($, value/premium-anchored)

Sell the **outcome** (measurable AI-fluency uplift + a Playbook that levels the
team), not seats. US eng-enablement budgets are real; anchor higher and lead with
ROI. Points: **$15 / $29 / custom**.

| Tier | Seats | Cadence | Key features | Price |
|---|---|---|---|---|
| **Free trial** | up to 5 | 14 days | Individual + team report | $0 |
| **Team** | up to 25 | Weekly | Individual + team report, trend, Playbook | **$15/seat/mo** |
| **Business** | up to 100 | Weekly | + gap heatmap, manager digest, benchmarking, opt-in leaderboard, SSO | **$29/seat/mo** |
| **Enterprise** | 100+ | Custom | + custom rubric, data-residency, redaction rules, SLA, CSM | **Custom ($40+/seat or platform fee + seats)** |

Annual: 2 months free. Why it converts there: $15/seat is an easy DevEx line vs.
a $150k engineer; the board-ROI framing ("provable AI adoption") lands with US
leadership; benchmarking against anonymized peer orgs is a premium wedge that
justifies Business over Team. A 40-engineer Business org = **$1,160/mo (~$13.9k/yr)**.

> §4 and §5 are deliberately different shapes: India competes on *affordable
> monthly anchors*, the US competes on *outcome/ROI + premium features*.

## 6. Unit economics

Cost to serve **one active engineer for one weekly period** (the expensive
cadence). Judge = OpenAI GPT-5 family (chunk = mini, aggregate = full) + one
Playbook pass amortized across the team.

| Item | Cost / seat / weekly period | Notes |
|---|---|---|
| Chunk scoring (mini model) | ~$0.10–0.25 | ~5–15 sessions, chunked ≤24k tok, budget-capped at 400k |
| Aggregate pass (full model) | ~$0.05–0.15 | one call per submission |
| Playbook extraction (amortized) | ~$0.03–0.08 | one team pass over top-K, split across seats |
| LLM cache savings | −20–40% | repeat/unchanged content served from Redis cache |
| Infra (store, workers, DB, S3) | ~$0.05 | async pipeline, precomputed rollups |
| **Total COGS / seat / weekly period** | **~$0.25–0.55** | |
| **≈ COGS / seat / month (weekly)** | **~$1.0–2.2** | monthly cadence ≈ ¼ of this |

**Gross margin per seat/mo:**
- India Growth ₹599 (~$7.2) − ~$1.5 COGS ≈ **~79% GM**.
- India Starter ₹299 (~$3.6, monthly cadence ~$0.5 COGS) ≈ **~86% GM**.
- US Team $15 − ~$2 COGS ≈ **~87% GM**; US Business $29 ≈ **~93% GM**.

**Price floor:** below **~₹149 / ~$4 per seat/mo at weekly cadence** we risk
negative margin once a heavy submitter (40+ long sessions) hits the token budget
cap — so weekly cadence stays out of the cheapest tier. Monthly-cadence Starter is
safe at ₹299.

## 7. Scalability of the money model

- **Margin improves with scale, not erodes:** the LLM cache hit-rate rises as more
  similar sessions flow; committed-use/volume discounts on inference kick in;
  cheaper mini models keep landing. GM trends **80% → 90%+** at 10–100× volume.
- **Cost is bounded per unit** by the `FLUENCY_TOKEN_BUDGET` cap (400k) — a
  pathological submitter can't blow up COGS; the ceiling is deterministic.
- **Precomputed `TeamReport`/`PlaybookEntry`** means read scale (1k concurrent
  admins, HLD §4.2) costs ~$0 marginal — dashboards are O(1) row reads.
- **Expansion is free money:** land 5 free seats → expand to 30 paid seats is pure
  seat multiplication on the same infra. Net revenue retention is the growth engine.
- **Watch item:** *volume* is far higher than the hiring product (every engineer,
  every period, forever, vs. once per candidate) — re-validate COGS at 10k seats
  before committing weekly-cadence pricing enterprise-wide.

## 8. Go-to-market angle

- **India pitch:** *"See how your team really uses AI — and make your median
  engineer as good as your best one, for less than a coffee per engineer a month."*
- **US pitch:** *"Provable AI fluency for your eng org. Measure it, coach it, and
  spread what your best engineers already do — with the receipts for your board."*
- **Wedge (win first):** the 10–40-engineer AI-forward startup where the CTO
  already *believes* in AI and wants proof + leverage — shortest sales cycle,
  founder-approves-budget, no procurement.
- **Land → expand:** free 5-seat first period → paid team → org-wide weekly +
  Playbook → benchmarking/Enterprise (SSO, residency, custom rubric).
- **Distribution:** ship as a **second product tab** on the existing Nideknil
  account (shared login, shared engine) so hiring customers see Pulse for free —
  cross-sell with zero new CAC.

## 9. Revenue sketch (bottoms-up, Year 1)

Assumes PLG self-serve + light founder-led sales; avg ~20 paid seats/org.

**India** (target 400 trial orgs Y1):
- Conservative: 400 × 12% convert × 20 seats × ₹599 = **~₹5.75L/mo (~₹69L ARR)**.
- Optimistic: 400 × 22% × 25 seats × ₹599 + some Enterprise = **~₹13–15L/mo (~₹1.6–1.8Cr ARR)**.

**US** (target 150 trial orgs Y1):
- Conservative: 150 × 10% convert × 20 seats × $15 = **~$4.5k/mo (~$54k ARR)**.
- Optimistic: 150 × 18% × 30 seats × $22 blended (Team+Business) = **~$17.8k/mo (~$214k ARR)**.

**Blended Y1 target:** conservative **~$120k ARR**, optimistic **~$430k ARR**, at
**~85% gross margin** — the model holds because COGS is capped and read-scale is
free. Renewal/expansion (NRR) is the real Year-2 lever, driven by the Playbook
being the feature that demonstrably makes teams better.
