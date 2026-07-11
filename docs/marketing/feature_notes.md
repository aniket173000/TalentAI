# Nideknil — Feature Notes for LinkedIn Content

Running list of shippable features to promote, grouped by audience. Pull from here when planning the next post — check a feature off (or add a note) once it's been posted about.

Brand reminders: name is **Nideknil** ("LinkedIn" reversed), domain **nideknil.in**, INR-first market, accent color Sky `#4CB2FF`.

---

## 🧑‍💼 For Recruiters

1. **Vector-Retrieval Ranking Funnel** — ranks the entire candidate database against a job in seconds (pgvector ANN retrieval → Cohere rerank → LLM evaluation on top candidates → blended final score). No manual resume screening.
2. **Reserve Pool ("Never Lose a Good Candidate")** — ranked top-15 runner-up bench behind the shortlist, instead of a flat rejected pile. One-click **Promote** if a shortlisted candidate falls through.
3. **AI Fluency Score** — 15%-weighted ranking factor scoring how well a candidate uses AI tools, derived from resume signals.
4. **AI Fluency Take-Home Assignments** — recruiter attaches a real assignment to a job; candidate builds it with Claude Code and submits a session transcript; pipeline scores AI-collaboration skill against an 8-dimension rubric.
5. **Recruiter MCP / Interview Copilot** — ✅ **POSTED 2026-07-10** (see below). List submissions, pull a candidate's fluency report, ask questions about a candidate, auto-generate interview questions — all from inside Claude Code.
6. **LinkedIn-Verified Identity + Company Enforcement** — recruiters sign in with LinkedIn; job postings locked to verified employer; explicit third-party recruiter flag.
7. **Employee Referral Engine** — employees open referral posts for open roles, verified via LinkedIn or work email; pool/waitlist ranking surfaces the best-fit referred candidates.
8. **Structured Resume Intelligence** — every resume LLM-parsed into a structured profile (skills, experience, education, projects), normalized against a 527-skill taxonomy.

## 🧑‍🎓 For Candidates

1. **One-Click LinkedIn Sign-In** — verified, frictionless signup/login.
2. **Auto-Parsed Career Profile** — upload once; skills, experience, projects extracted and normalized automatically.
3. **AI Fluency Assignments** — a real chance to demonstrate (not just claim) AI fluency — build with Claude Code, submit transcript, get evaluated on substance.
4. **Claude Code / MCP Companion** — candidates invited to an assignment can pull their brief and submission instructions directly inside Claude Code.
5. **Get Referred, Not Ignored** — apply through verified-employee referral posts instead of cold-applying; ranked fairly against other referred applicants.
6. **Reserve Pool, Not Rejection** — falling just short of the shortlist means a ranked bench spot, not a dead end — can still be promoted later.

## 🏢 Platform / Brand

- **Nideknil** — the brand itself, positioned as the anti-black-box hiring platform.
- **AI Fluency for Teams (Nideknil Pulse)** — forthcoming B2B product (not yet shipped) for continuous internal engineer AI-fluency reporting. Good future teaser, not ready to post yet.

---

## Posted Content Log

### 2026-07-10 — Recruiter MCP / Interview Copilot

**Post copy:**

> Recruiters: your best candidate just aced the ranking funnel. Then you walk into the interview with... a resume PDF and 3 minutes of skimming.
>
> Here's the 4-tool AI copilot that fixes that — built directly into Claude Code:
>
> Every hiring team optimizes screening and ranking, then hands the interviewer a blank slate. The result: generic questions, no memory of *why* this candidate scored well, and interview prep that's either rushed or skipped entirely. We closed that gap by turning the interviewer's own AI assistant into a live, data-grounded copilot.
>
> 1️⃣ **List Submissions** ↳ Pull every candidate who's completed an assignment for your role, right inside your existing Claude Code session — no tab-switching, no dashboard hunting.
>
> 2️⃣ **Pull the Fluency Report** ↳ Instantly retrieve the full AI-collaboration scorecard: how the candidate actually used AI to build, think, and ship — not what they claimed on a resume.
>
> 3️⃣ **Ask About the Candidate** ↳ Query their profile and submission history in natural language. "What was their weakest rubric dimension?" "How did they debug under pressure?" Answered on the spot.
>
> 4️⃣ **Auto-Generate Interview Questions** ↳ Get interview questions custom-built from *this candidate's* real submission — not a generic bank of 20 questions every recruiter in the country is also asking.
>
> The best interviewers aren't the ones with the most experience — they're the ones who walk in the most prepared. We just made "prepared" take 30 seconds instead of 30 minutes of digging through docs.
>
> This is live inside Nideknil today. If you're a recruiter tired of flying blind into interviews — comment "COPILOT" and I'll walk you through it.
>
> Follow Nideknil for more hiring intelligence built for how recruiters *actually* work, not how software vendors imagine they work.

**Hashtags used:** `#FutureOfWork #TalentAcquisition #HRTech #AIRecruiting #RecruitmentInnovation #HiringTech #TechRecruiting #ModelContextProtocol #ClaudeAI #AgenticAI #StartupIndia #PeopleAnalytics #TalentTech #Nideknil #HRTechIndia` (trim to 5–8 in-post; rest can go in first comment).

**Tag suggestions:**
- **Anthropic** (highest-value tag — feature built on their Model Context Protocol / Claude Code; verify their current official LinkedIn page before tagging).
- HR-tech media: ETHRWorld (Economic Times HR World), People Matters, SHRM, RecruitingDaily / HR Dive (for global reach).
- Prefer tagging 1–2 recruiting individuals whose content you already engage with over cold-tagging strangers — cold tags read as spam and can hurt reach.
- Always verify exact handles on LinkedIn before publishing; don't guess spellings.

---

## Outreach DM Draft — Atulya Marwah (2026-07-11)

**Context:** Founder/recruiter, hiring AI engineers, PMs, Platform engineers for enterprise agentic workflows, asked what Nideknil can do for aggressive growth hiring. Shortened DM version below (see chat for the longer first draft).

**Sent draft:**

> Hey Atulya, congrats on the growth — hiring AI engineers, PMs, and Platform engineers at once is exactly the hiring problem Nideknil is built for.
>
> Quick version: we're an anti-black-box hiring platform. Our vector-retrieval funnel ranks your entire candidate DB against a role in seconds, so volume hiring doesn't mean manual resume triage.
>
> Since you're building agentic workflows, two things will land for you specifically:
> - **AI Fluency Assignments** — candidates build a real take-home with Claude Code and submit the session transcript; we score actual AI-collaboration skill on an 8-dimension rubric, not resume claims.
> - **Recruiter MCP / Interview Copilot** — built right into Claude Code: pull a candidate's full fluency scorecard, ask natural-language questions about them, auto-generate interview questions from their actual submission — no tab-switching, no dashboard.
>
> We also keep a ranked Reserve Pool so strong runner-ups never disappear — handy when you're filling multiple roles back to back.
>
> If there's a specific feature you need for your hiring flow that we don't have — say the word, we build fast and would rather ship it than have you work around a gap.
>
> Free for a quick call this week to walk you through it live?

---

## Template Reference (Numbered List / Playbook)

```
Hook: "[Target Audience]: Here's the [Number]-step playbook/reasons why/steps to [Achieve Desirable Outcome] / I achieved [Impressive Result]. Here's how:"

Context: (Optional) Briefly explain the importance or the struggle this addresses.

List:
[Step/Reason 1]: Brief explanation.
[Step/Reason 2]: Brief explanation.
... (use arrows ↳ → or numbers)

Elaboration/Key Takeaway: (Optional) Summarize the core principle or add a final thought.

CTA: "What would you add?" / "Try this out." / "Comment '[Keyword]' for [Related Resource]." / "Follow for more [Topic] tips."
```
