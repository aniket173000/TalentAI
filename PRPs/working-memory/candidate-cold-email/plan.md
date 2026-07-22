# Candidate Cold-Email Agent ("Cold Email")

**Status:** PHASE 1 BUILT · 2026-07-19 (Phase 0 deep-link skipped by decision — in-app
review-&-send only). Pending: Google Cloud console setup (client credentials, gmail.send
scope on consent screen, redirect URI, test users) + restricted-scope verification for >100
users. Code: `services/cold_email_agent.py`, `services/gmail_sender.py`,
`services/llm_lite.py` (shared with admin outreach), `routers/cold_email.py`,
`frontend/src/pages/ColdEmail.tsx` at `/cold-email`.
**One-liner:** A candidate pastes a hiring post (LinkedIn post, email, JD), clicks **Analyze**,
and gets a recruiter-ready cold email written in their own voice, grounded in their verified
Nideknil profile — then clicks **Apply & Send** and it goes out **from the candidate's own
email address** to the recruiter.

---

## 1. Why this wins

Every hiring post with an email in it gets hundreds of identical "Dear Sir, please find my
resume attached" replies. A personalized email takes a student 20+ minutes; most don't bother
or send garbage. We already hold the two hard ingredients:

1. **Structured candidate profiles** (`CandidateProfile`: normalized skills against the
   527-skill taxonomy, work history, projects, YoE) — extracted at onboarding, since resume
   upload is compulsory.
2. **A working post→email agent** (`services/outreach_agent.py` + `routers/outreach.py`) —
   extraction with regex safety net, tolerant JSON parsing, draft/send separation, send
   logging, duplicate-contact warning. The candidate feature is this pipeline re-pointed:
   personalize from the *candidate's* profile and send *as the candidate*.

The differentiator vs. ChatGPT-in-a-tab: **grounded personalization**. We deterministically
intersect the post's requirements with the candidate's verified profile and force the LLM to
write only from that evidence. No hallucinated internships, no generic flattery.

---

## 2. The critical decision: how "from the candidate's email" works

| Option | Verdict |
|---|---|
| **A. Gmail compose deep-link** (`https://mail.google.com/mail/?view=cm&fs=1&to=…&su=…&body=…`) | ✅ **Phase 0.** Opens the candidate's real Gmail with everything prefilled; they press Send. Genuinely from their address, replies come to them, zero OAuth, zero deliverability work, ships in days. Limits: no attachment prefill, ~8KB URL budget (fine for a 160-word email), sent-status is self-reported. Provide `mailto:` fallback for non-Gmail users. |
| **B. Gmail API `gmail.send` via OAuth** | ✅ **Phase 1 — the "magic" one-click Apply & Send.** True background send as the candidate, resume attached, message lands in their Sent folder. Needs: incremental auth (`access_type=offline`, `prompt=consent`), encrypted refresh-token storage, and — critically — **Google restricted-scope verification (app review + CASA Tier 2 security assessment)** to exceed 100 users. That's a multi-week external dependency: **start the verification paperwork the week Phase 1 development starts**, ship Phase 0 meanwhile. |
| C. Send from `@nideknil.in` with `Reply-To: candidate` | ❌ Rejected. Recruiter sees a platform domain (reads as spam), all reputation risk concentrates on our domain, and it fails the core requirement. |
| D. Candidate SMTP app-passwords | ❌ Rejected. Google killed less-secure-app passwords; awful UX. |

Non-Gmail coverage later: Microsoft Graph `Mail.Send` for Outlook (Phase 3). In our market
(students, India) Gmail-first covers the overwhelming majority.

---

## 3. AI pipeline (the product)

Four stages. A and B are the moat; C is prose; D is polish.

### Stage A — Extract (untrusted input → fixed schema)
Generalize `extract_from_post()`:

```json
{
  "recruiter_email": "…", "recruiter_name": "…", "company": "…",
  "role_title": "…", "seniority": "intern|junior|mid|senior",
  "must_have_skills": [], "nice_to_have_skills": [],
  "notable_context": "1 sentence — what the company does / anything referenceable",
  "application_instructions": "e.g. 'mention referral code', 'subject must be NAME-ROLE'"
}
```

- Keep the regex email safety net (`_EMAIL_RE`).
- `application_instructions` matters: posts often say *"email with subject 'SDE Intern – Name'"*
  — following that instruction is exactly what a rushed student misses, and exactly what makes
  the recruiter open it.
- Guards: no email found → ask the candidate to type it (editable field regardless);
  `noreply@`/`support@`/`careers@jobboard` → warn; MX lookup on the domain (dnspython) → warn
  on failure. This is the "reach the recruiter accurately" requirement.
- Prompt-injection note: the pasted post is adversarial input. Mitigation = fixed JSON schema
  extraction, evidence-grounded drafting (Stage C can only cite Stage B output), and a human
  review step before anything sends. Never auto-fire.

### Stage B — Evidence match (deterministic core + LLM ranking)
The anti-hallucination layer, and the part competitors can't copy without our data:

1. Normalize `must_have_skills`/`nice_to_have_skills` through the existing
   `skills_normalizer` (527-skill taxonomy).
2. Intersect with the candidate's `normalized_skills` → **matched skills** (exact, defensible).
3. Rank the candidate's projects + work-history bullets against the role (reuse the pgvector
   embedding infra, or a single cheap LLM ranking call over ≤20 items).
4. Output: top 3 **proof points**, each `{claim, source: profile_field}`, plus the matched-skill
   list, plus honest gaps (used to *avoid* claiming, never to self-deprecate in the mail).

### Stage C — Draft (grounding contract)
One LLM call. Rules distilled from what actually gets cold emails answered:

- 110–160 words, first person, candidate's voice. Subject follows `application_instructions`
  if present, else `Role — Name (top matched skill)`.
- **Every claim must trace to a Stage B proof point.** Skills not in the matched list may not
  appear. This sentence goes in the prompt verbatim.
- Structure: 1 line why-them (from `notable_context`) → 2–3 lines proof (specific, numbers if
  the profile has them) → 1 line CTA ("attached my resume; happy to do a short task/call").
- No "I hope this email finds you well", no "esteemed organization", no emoji, plain text.
- Tone presets: `direct` (default) / `warm` / `formal`. Reuse `_strip_stray_signoff()`; the
  signature is the *candidate's* (name, phone, profile link) — **never Nideknil branding**
  inside the recruiter-facing email. A "Sent via Nideknil" footer line stays OFF until
  scale (decided 2026-07-19) — revisit as a growth lever once send volume is meaningful.

### Stage D — Critique pass (premium tier)
Second LLM call scores the draft (specificity, length, instruction-compliance, cringe) and
revises once if any score is low. Cheap (~₹0.5) and dramatically raises the floor. This is a
clean free/paid quality differentiator.

**Model routing:** free tier → existing Groq/Gemini plumbing (`OUTREACH_LLM_PROVIDER`
pattern); paid tier → OpenAI/Claude via existing `ai_service` + `llm_cache` (cache keyed on
post-hash + profile-hash, so "Analyze" twice is free). Cost per draft is well under ₹1 even
on paid models.

---

## 4. Backend design

### New files
- `services/cold_email_agent.py` — stages A–D (import shared helpers from `outreach_agent.py`;
  extract `_call_llm`/`_parse_json` into a shared `services/llm_lite.py` rather than copy).
- `routers/cold_email.py` — candidate-authed (`require_candidate`-style dep):

```
POST /api/cold-email/analyze   {source_text}                    → extraction + evidence + draft + quota status
POST /api/cold-email/redraft   {cold_email_id, tone, feedback}  → new draft (same evidence)
POST /api/cold-email/send      {cold_email_id, subject, body, attach_resume} → Gmail API send (Phase 1)
POST /api/cold-email/mark-sent {cold_email_id}                  → Phase 0 self-report after deep-link
GET  /api/cold-email/history                                    → the candidate's own sends
GET  /api/auth/google/gmail/connect + /callback                 → incremental auth, gmail.send (Phase 1)
```

Draft and send stay **separate calls** (same human-in-the-loop invariant as the admin agent —
also strengthens the Google-verification narrative: user-reviewed individual mail, not bulk
automation).

### New models
```python
class ColdEmail(Base):            # mirrors OutreachEmail
    id, user_id, recruiter_email, recruiter_name, company, role_title
    source_text, extracted_json, evidence_json
    subject, body, tone
    status         # draft | sent | sent_selfreported | failed
    send_channel   # deeplink | gmail_api
    gmail_message_id, error, created_at, sent_at

class GoogleMailCredential(Base): # Phase 1
    id, user_id (unique), refresh_token_encrypted   # Fernet, key in env — never plaintext
    scopes, connected_at, revoked_at
```

### Safety / abuse / deliverability
- **Daily cap ~10 sends/user, monthly quota by tier.** Protects the candidate's own Gmail
  reputation (Gmail throttles unusual sending) and our OAuth app standing. Return
  `quota_remaining` on every response so the UI can show it.
- Duplicate warning: "You emailed this recruiter on {date}" (existing pattern, per-user).
- No open-tracking pixels. They hurt deliverability and would burn candidate trust.
- Resume attach (Phase 1): the profile resume file via existing storage service; enforce <5MB.

---

## 5. Frontend

New candidate page `ColdEmail.tsx` (route `/cold-email`), patterned on `OutreachAgent.tsx`.
Product name in the UI: **"Cold Email"** (decided 2026-07-19).

1. **Paste box** ("Paste the hiring post — include the email if you have it") → **Analyze**.
2. **Extraction card**: recruiter email (editable — always), name, company, role, matched
   skills as chips, warnings (noreply/MX/duplicate) inline.
3. **Draft editor**: subject + body, tone selector, **Regenerate**, live word count.
4. **Send row**: Phase 0 → `Open in Gmail ↗` (+ "Mark as sent" on return) and `Copy email`;
   Phase 1 → `Apply & Send` with ✅ resume-attach toggle; first use triggers the Gmail-connect
   OAuth consent.
5. **History tab** + quota meter ("3 of 5 free emails left this month").

Entry points: CandidateDashboard card + a "Cold email the recruiter" affordance anywhere we
show an external role. Landing page: add a "For Candidates" bullet once live.

---

## 6. Monetization (the forcing function for the entitlement layer)

The deferred payment/entitlement layer (see `project_monetization`) gets built **for this
feature first** — it's the cleanest metered unit in the product ("1 send = 1 credit") and the
pricing-page removal (done 2026-07-18) cleared the old "candidates never pay" copy.

| | Free | Pro (₹149/mo) or credit packs (₹49 / 10 sends) |
|---|---|---|
| Analyze + draft | ✅ (Groq/Gemini) | ✅ premium model + critique pass |
| Sends | 5/month | 100/month fair-use |
| Send channel | Gmail deep-link | One-click Apply & Send + resume attach |
| Extras | — | Follow-up reminder drafts, history analytics |

- **Meter sends, not drafts** (drafts cost us <₹1; sends are where the value lands). Rate-limit
  drafts generously (e.g. 20/day) purely for cost control.
- Later revenue layers: follow-up sequences (auto-drafted polite bump after 5–7 days —
  draft-only, the candidate always presses send), and **B2B2C college/placement-cell licenses**
  (bulk seats for their students — fits the existing Colleges surface).
- Price test at launch: free quota 3 vs 5; ₹99 vs ₹149. Log every quota-hit event.

---

## 7. Phases & validation gates

**Phase 0 — ship the loop (2–3 days dev)**
Pipeline (stages A–C) + `ColdEmail` model + analyze/redraft/mark-sent/history endpoints +
`ReachOut.tsx` + Gmail deep-link + hardcoded free quota.
*Gates:* unit tests — extraction fixtures (5 real LinkedIn-post shapes incl. no-email and
injection-attempt), grounding check (draft may not contain skill strings absent from the
evidence list), quota enforcement; manual E2E: paste real post → send from own Gmail →
recruiter-side render check (Gmail + Outlook).

**Phase 1 — one-click send (1 wk dev + Google review lead time, start paperwork day 1)**
Gmail incremental OAuth + encrypted refresh tokens + `gmail.send` send path + resume
attachment + connect/disconnect UI. Submit restricted-scope verification immediately;
under 100 users we run unverified meanwhile.
*Gates:* token refresh/revoke tests; send lands in user's Sent folder; attachment integrity;
failure paths (revoked token → clean re-connect prompt).

**Phase 2 — money**
Entitlement/metering layer + Razorpay + tier gating + critique pass + premium model routing.
*Gates:* quota accounting under concurrent sends; downgrade/expiry behavior.

**Phase 3 — growth**
Follow-up reminders, Outlook (Graph `Mail.Send`), response analytics, optional reply
detection (needs read scopes — decide deliberately, big consent-screen cost).

---

## 8. Decisions (resolved 2026-07-19)

1. **Google Cloud project:** use the **same project** as the login OAuth (credentials still
   need to be configured — `project_pending_items`). One brand verification, one consent
   screen; the `gmail.send` restricted-scope review rides on it.
2. **Product name:** **"Cold Email"** — page `ColdEmail.tsx`, route `/cold-email`,
   router `routers/cold_email.py`.
3. **"Sent via Nideknil" footer:** stays **off until scale**; revisit as a growth A/B once
   send volume is meaningful.
