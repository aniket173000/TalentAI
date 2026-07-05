import json
import logging
from functools import lru_cache

from openai import AsyncOpenAI

from config import settings
from services.ai.base import AIStrategy

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _client() -> AsyncOpenAI:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Add it to backend/.env and restart."
        )
    return AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


class OpenAIStrategy(AIStrategy):
    """AI provider backed by OpenAI GPT-4o + text-embedding-3-small."""

    async def screen_resume(
        self, jd_text: str, resume_text: str, job_title: str
    ) -> dict:
        system = (
            "You are a senior talent analyst with 15+ years of recruiting experience. "
            "Evaluate resumes with deep project analysis and zero bias. "
            "For every project in the resume, score its direct relevance to the JD. "
            "Always respond with valid JSON only."
        )
        user = f"""Analyse this resume against the job description.

JOB TITLE: {job_title}

JOB DESCRIPTION:
{jd_text[:3500]}

CANDIDATE RESUME:
{resume_text[:3500]}

STEP 1 — Resolve technology OR conditions (do this FIRST, before scoring):
Identify every "X or Y", "X (preferred) or another Z", "X / Y / Z" requirement in the JD.
For each such requirement: if the candidate has ANY listed technology OR a strong equivalent in the same category, mark it as SATISFIED. Do NOT penalise for lacking the "preferred" option when an alternative is present and strong.
Common equivalences to honour:
- "Node.js or another backend language" → satisfied by strong Java, Go, Python, Ruby, Rust, etc.
- "React or Angular or Vue" → satisfied by any one
- "MySQL or PostgreSQL" → satisfied by either
- "AWS or GCP or Azure" → satisfied by any one
- "Kafka or RabbitMQ or SQS" → satisfied by any one

STEP 2 — Extract experience facts:
- required_years: minimum years stated in the JD (range → use minimum; unstated → 0)
- candidate_years: sum all non-overlapping professional roles. Round to one decimal.
- experience_ratio: candidate_years / required_years, capped at 1.0. If required_years is 0, set 1.0.

STEP 3 — Compute sub-scores (each 0-100):
- skills_score: how well candidate skills match JD requirements, using the OR conditions resolved in STEP 1.
  A requirement satisfied by an equivalent technology counts as FULLY met — do not apply a partial-credit penalty for using an alternative.
  Only deduct for requirements that are genuinely unmet (no alternative present).
- project_score: relevance and depth of candidate's projects to the role
- experience_score: based on experience_ratio —
    ratio >= 1.0  → 100
    ratio >= 0.85 → 80
    ratio >= 0.70 → 60
    ratio >= 0.50 → 40
    ratio >= 0.30 → 20
    ratio <  0.30 → 0

STEP 4 — Gaps and suggestions:
- Only list a skill as a gap if it is a hard requirement AND no equivalent is present in the resume.
- Do NOT list preferred/nice-to-have skills as gaps.
- Do NOT list a skill as a gap if the candidate has a strong alternative that satisfies the same OR condition (per STEP 1).
  Example: if JD says "Node.js (preferred) or another backend language" and candidate has strong Java/Go → Node.js is NOT a gap.
- Verify each gap against the actual resume text before listing it — do not hallucinate missing skills.

STEP 5 — AI Fluency (how effectively this candidate uses AI in their work):
Judge from concrete resume evidence — NOT from whether the role is technical.
Look for: building with LLMs / GenAI / RAG / agents, shipping AI-powered features,
ML/AI engineering, prompt engineering, and everyday use of AI tools (Copilot,
Cursor, ChatGPT, Claude) or AI-driven automation to accelerate their work.
Scoring rubric (ai_fluency.score, 0-100):
- 90-100: Builds AI/ML products or deeply integrates LLMs/GenAI into their work.
- 70-89:  Regularly ships AI features or uses AI tools/automation to accelerate delivery.
- 40-69:  Some exposure — occasional AI tooling or one AI-adjacent project.
- 0-39:   Little to no evidence of AI usage.
List 1-3 short `signals` quoting concrete evidence, and a one-line `rationale`.
If the resume shows no AI evidence, score it low and say so — do not invent signals.

Return ONLY this JSON (no markdown):
{{
    "match_score": <final capped composite score 0-100>,
    "required_years": <number>,
    "candidate_years": <number>,
    "experience_ratio": <0.0-1.0>,
    "sub_scores": {{
        "skills": <0-100>,
        "projects": <0-100>,
        "experience": <0-100>
    }},
    "ai_fluency": {{
        "score": <0-100>,
        "signals": ["concrete evidence 1", "concrete evidence 2"],
        "rationale": "<one-line explanation of the score>"
    }},
    "project_scores": [
        {{
            "project_name": "<name as written in resume>",
            "relevance_score": <0-100>,
            "tech_overlap": ["tech1", "tech2"],
            "notes": "<one-line relevance note>"
        }}
    ],
    "strengths": ["strength 1", "strength 2", "strength 3"],
    "gaps": ["gap 1", "gap 2"],
    "improvement_suggestions": ["tip 1", "tip 2", "tip 3"],
    "summary": "2-3 sentence overall assessment"
}}

Scoring guide:
- 90-100: Exceptional — exceeds all requirements including experience
- 80-89: Strong — meets core requirements with sufficient experience
- 70-79: Partial — meets some requirements, moderate experience gap
- Below 70: Weak — significant skill, project, or experience gaps

Be rigorous on experience shortfalls. Be fair on technology alternatives — a strong Java engineer is not a weak Node.js engineer, they are a strong backend engineer who chose a different language."""

        response = await _client().chat.completions.create(
            model=settings.AI_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        result = json.loads(response.choices[0].message.content)

        # Recompute composite from sub_scores to prevent the LLM from ignoring the formula.
        # The LLM is trusted for sub_scores (which reflect its semantic analysis) but not
        # for the final arithmetic — it routinely applies holistic bias instead of the formula.
        sub = result.get("sub_scores", {})
        skills_s = float(sub.get("skills", 0))
        projects_s = float(sub.get("projects", 0))
        exp_s = float(sub.get("experience", 0))
        if skills_s or projects_s or exp_s:
            composite = (skills_s * 0.35) + (projects_s * 0.30) + (exp_s * 0.35)
            exp_ratio = float(result.get("experience_ratio", 1.0))
            if exp_ratio < 0.50:
                composite = min(composite, 55.0)
            elif exp_ratio < 0.70:
                composite = min(composite, 70.0)
            result["match_score"] = round(composite, 1)

        return result

    async def generate_rejection_email(
        self,
        candidate_name: str,
        job_title: str,
        company: str,
        match_score: float,
        gaps: list,
        improvement_suggestions: list,
        reason: str = "score_below_threshold",
        recruiter_name: str = "Recruitment Team",
        recruiter_email: str = "",
        recruiter_position: str = "Recruiter",
    ) -> str:
        situation_map = {
            "score_below_threshold": "the applicant's profile did not meet the minimum match threshold for this role",
            "pool_full": "the applicant pool is currently full with higher-matching candidates",
            "displaced": "a stronger candidate entered the pool, displacing the applicant's position",
        }
        situation = situation_map.get(reason, situation_map["score_below_threshold"])

        signature_lines = [recruiter_name]
        if recruiter_email:
            signature_lines.append(recruiter_email)
        signature_lines.append(recruiter_position)
        signature_lines.append("Nideknil Recruitment Team")
        signature = "\n".join(signature_lines)

        prompt = f"""Write a professional, empathetic rejection email for a job applicant.

Context:
- Candidate: {candidate_name}
- Role: {job_title} at {company}
- AI Match Score: {match_score:.1f}%
- Situation: {situation}
- Profile gaps: {', '.join(gaps[:3]) if gaps else 'General qualification gaps'}
- Suggested improvements: {', '.join(improvement_suggestions[:3]) if improvement_suggestions else 'Resume optimisation'}

Requirements:
1. Open with a genuine thank-you for applying
2. Deliver the news clearly but compassionately (no vague corporate speak)
3. Reference 2-3 specific, actionable improvement tips from the suggestions above
4. Encourage them to strengthen their profile and consider future openings
5. Close on an uplifting, forward-looking note
6. Maximum 250 words, professional yet human tone
7. End with exactly this sign-off (no changes):

Best regards,
{signature}

Start directly with: Dear {candidate_name},"""

        response = await _client().chat.completions.create(
            model=settings.AI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=400,
        )
        return response.choices[0].message.content

    async def rank_tied_candidates(
        self,
        jd_text: str,
        job_title: str,
        candidates: list,
    ) -> list:
        blocks = "\n\n".join(
            f"CANDIDATE {i + 1} (ID: {cid})\nName: {name}\n{resume[:1500]}"
            for i, (cid, name, resume) in enumerate(candidates)
        )
        prompt = f"""Break a tie between candidates who scored equally on an AI resume screen.
Compare their resumes deeply to find who is the stronger fit for this specific role.

JOB TITLE: {job_title}
JOB DESCRIPTION:
{jd_text[:2000]}

TIED CANDIDATES:
{blocks}

Focus on depth of experience, specificity of skills, and project relevance.
Return ONLY this JSON (no markdown):
{{
    "ranking": [<id_best>, <id_second>, ...],
    "reasoning": "<2-3 sentences on why the top candidate wins the tie>"
}}"""

        response = await _client().chat.completions.create(
            model=settings.AI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=300,
        )
        result = json.loads(response.choices[0].message.content)
        return result.get("ranking", [c[0] for c in candidates])

    async def generate_rank_explanation(
        self,
        candidate_name: str,
        job_title: str,
        rank: int,
        total: int,
        resume_text: str,
        above_candidates: list,
        jd_text: str,
    ) -> str:
        above_blocks = "\n\n".join(
            f"Rank #{c['rank']} (Score: {c['score']:.1f}%)\n"
            f"Strengths: {', '.join(c['strengths'][:3])}\n"
            f"Resume excerpt: {c['resume'][:800]}"
            for c in above_candidates
        )
        prompt = f"""A candidate was shortlisted for a job at rank #{rank} out of {total}.
Write a short, honest, and constructive explanation of their standing.

JOB: {job_title}
JOB DESCRIPTION EXCERPT:
{jd_text[:800]}

THIS CANDIDATE: {candidate_name} — Rank #{rank} of {total}
THEIR RESUME EXCERPT:
{resume_text[:800]}

CANDIDATES RANKED ABOVE THEM:
{above_blocks}

Write 3-4 sentences that:
1. Name 2-3 specific things the higher-ranked candidates have that this candidate lacks
2. Give concrete, actionable advice on what to strengthen to move up in the ranking

Address the candidate directly (use "you"/"your"). Be specific, not generic."""

        response = await _client().chat.completions.create(
            model=settings.AI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.6,
            max_tokens=250,
        )
        return response.choices[0].message.content

    async def get_embedding(self, text: str) -> list[float]:
        response = await _client().embeddings.create(
            model=settings.EMBEDDING_MODEL,
            input=text[:8000],
        )
        return response.data[0].embedding

    async def generate_displacement_comparison(
        self,
        rank1_resume: str,
        rank1_score: float,
        displaced_resume: str,
        displaced_score: float,
        jd_text: str,
        job_title: str,
    ) -> dict:
        prompt = f"""You are a career coach helping a candidate understand why they were displaced from a job shortlist.

A stronger candidate (Score: {rank1_score:.1f}%) has entered the pool, displacing this candidate (Score: {displaced_score:.1f}%).

JOB TITLE: {job_title}
JOB DESCRIPTION (excerpt):
{jd_text[:1500]}

TOP CANDIDATE RESUME (rank #1 — do NOT reveal their name):
{rank1_resume[:2000]}

DISPLACED CANDIDATE RESUME:
{displaced_resume[:2000]}

Compare the two profiles specifically against this job's requirements. Identify 3-5 areas where the top candidate is stronger.

Return ONLY this JSON (no markdown):
{{
  "rank1_key_strengths": [
    "<specific strength 1 — be concrete, e.g. '5 years Golang in fintech at scale' not 'more experience'>",
    "<specific strength 2>",
    "<specific strength 3>"
  ],
  "comparison": [
    {{
      "area": "<skill or experience area, e.g. 'Distributed Systems', 'NoSQL Databases'>",
      "rank1_has": "<what the top candidate demonstrates in this area — be specific>",
      "you_have": "<what the displaced candidate has in this area — be honest but fair, 'none mentioned' if absent>",
      "improvement": "<1-2 concrete, actionable steps the displaced candidate can take to close this gap>"
    }}
  ],
  "encouragement": "<2-3 sentences: acknowledge their strengths, name the 1-2 most impactful things to work on, and encourage them to reapply with an updated resume>"
}}

Rules:
- Never reveal the top candidate's name, company, or any personally identifiable information.
- Be specific and honest — vague advice like 'gain more experience' is not helpful.
- Limit comparison to at most 5 areas (the most impactful gaps only).
- If the displaced candidate is actually competitive, say so honestly in encouragement."""

        last_exc: Exception | None = None
        for attempt in range(1, 4):
            try:
                response = await _client().chat.completions.create(
                    model=settings.AI_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"},
                    temperature=0.3,
                    max_tokens=1000,
                )
                return json.loads(response.choices[0].message.content)
            except (json.JSONDecodeError, KeyError, ValueError) as exc:
                last_exc = exc
                logger.warning("generate_displacement_comparison attempt %d failed: %s", attempt, exc)

        raise RuntimeError(f"generate_displacement_comparison failed after 3 attempts: {last_exc}")

    async def verify_skill_claims(self, skills: list[str], resume_text: str) -> dict:
        skills_list = "\n".join(f"- {s}" for s in skills)
        prompt = f"""You are a recruiting analyst verifying whether a candidate's newly claimed skills
are actually supported by their work experience and projects.

Newly claimed skills:
{skills_list}

Candidate resume (work history, projects, certifications):
{resume_text[:4000]}

For each claimed skill, determine if the resume's work experience or project descriptions
genuinely demonstrate evidence of that skill. Be strict — keyword appearances alone are
not evidence; look for actual usage in context (job responsibilities, project descriptions).

Return ONLY a JSON object — one key per skill (exact spelling from the list above):
{{
  "<skill_name>": {{
    "has_evidence": true or false,
    "confidence": <0.0-1.0>,
    "reason": "<one sentence>"
  }}
}}"""

        last_exc: Exception | None = None
        for attempt in range(1, 4):
            try:
                response = await _client().chat.completions.create(
                    model=settings.AI_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"},
                    temperature=0.0,
                    max_tokens=600,
                )
                return json.loads(response.choices[0].message.content)
            except (json.JSONDecodeError, KeyError, ValueError) as exc:
                last_exc = exc
                logger.warning("verify_skill_claims attempt %d failed: %s", attempt, exc)

        raise RuntimeError(f"verify_skill_claims failed after 3 attempts: {last_exc}")

    async def generate_readiness_roadmap(
        self,
        jd_text: str,
        resume_text: str,
        job_title: str,
        current_score: float,
        gaps: list,
        improvement_suggestions: list,
        fresher_mode: bool = False,
    ) -> dict:
        mode_note = (
            "This is a fresher/internship role. Focus on projects, coursework, and skills "
            "buildable in weeks. Prioritise action over credentials."
            if fresher_mode else
            "This is a professional role. Balance ambition with realism."
        )
        prompt = f"""You are a brutally honest career coach. A candidate wants to know how ready they genuinely are for a specific job role.

JOB TITLE: {job_title}
{mode_note}

JOB DESCRIPTION (key requirements):
{jd_text[:2000]}

CANDIDATE RESUME:
{resume_text[:2500]}

STEP 1 — Domain alignment check (do this first):
Identify the PRIMARY domain of the role (e.g. Software Engineering, Product Management, Data Science, Marketing).
Identify the PRIMARY domain of the candidate (e.g. their degree, job titles, project types).
If the domains are DIFFERENT — the candidate needs a career transition, not just skill-building. This must heavily limit the readiness score.

STEP 2 — Compute an HONEST readiness_score (0-100):
Apply these hard caps BEFORE any other scoring:
- Candidate's primary domain is DIFFERENT from the role's domain → max 30 (career switcher)
- Candidate has NO practical projects or work in the role's domain → max 25
- Candidate has some cross-domain skills (e.g. SQL, data analysis) but no direct domain experience → max 40
- Candidate is from the same domain but missing 3+ key skills → max 65
- Candidate is same-domain with 1-2 skill gaps → 65-84
- Strong match with all key skills → 85-100
Do NOT let adjacent skills (e.g. fintech business knowledge, product management) substitute for core technical skills when the role demands them.
Do NOT inflate the score to be "encouraging" — an honest low score is more useful than a misleading high one.

STEP 3 — Readiness label from score:
< 25 → "Career Switch Required"
25-39 → "Just Starting"
40-59 → "Building Up"
60-74 → "Getting There"
75-84 → "Almost Ready"
85-100 → "Ready to Apply"

STEP 4 — Roadmap (ordered by impact, highest first):
If this is a career switch, the roadmap should clearly say what fundamental reskilling is needed — not just small tweaks.
If this is a skill gap, give concrete actionable steps.

Return ONLY valid JSON (no markdown):
{{
    "readiness_score": <integer 0-100, computed per STEP 2>,
    "readiness_label": "<label from STEP 3>",
    "domain_gap": "<null if same domain, else short description: e.g. 'Product Manager → Backend Engineer requires full technical reskilling'>",
    "roadmap": [
        {{
            "skill_area": "<specific area>",
            "current": "<what they have now, honest>",
            "action": "<concrete action: build X, learn Z, get certified in Y>",
            "resource_hint": "<specific project or resource>",
            "estimated_gain": <integer 2-20>
        }}
    ],
    "quick_wins": ["<action completable today that genuinely helps>"],
    "encouragement": "<one honest, realistic, motivating sentence — acknowledge the gap but give a clear direction>"
}}

Rules:
- roadmap: 3-5 items. For career switchers, items should be about building foundational skills, not polish.
- quick_wins: only list things actually useful given the real gap. If the gap is fundamental, say so (e.g. "Complete a 3-month Python course before anything else")
- Be specific and honest. A 20% readiness score is NOT a failure — it is accurate information that helps the candidate plan realistically."""

        response = await _client().chat.completions.create(
            model=settings.AI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        result = json.loads(response.choices[0].message.content)
        # Clamp readiness_score to valid range
        if "readiness_score" in result:
            result["readiness_score"] = max(0, min(100, int(result["readiness_score"])))
        return result

    async def extract_structured_profile(self, resume_text: str) -> dict:
        system = (
            "You are a precise resume parser. Extract structured information exactly as "
            "it appears in the resume. Never invent information — if a field is missing "
            "set it to null. Always respond with valid JSON only."
        )
        user = f"""Parse this resume and extract all structured fields.

RESUME:
{resume_text[:12000]}

Return ONLY this JSON (no markdown, no extra text):
{{
  "full_name": "<full name or null>",
  "email": "<email address or null>",
  "phone": "<phone number or null>",
  "location": "<city, country or null>",
  "total_yoe": <total professional years as a float, or null>,
  "work_history": [
    {{
      "company": "<company name>",
      "title": "<job title>",
      "start_date": "<month year, e.g. Jan 2021, or year>",
      "end_date": "<month year or 'Present' or null>",
      "description": "<a 1-2 sentence summary of the role>",
      "highlights": ["<every responsibility / achievement / bullet point exactly as written in the resume for this role — do NOT summarise or drop any; keep each bullet as its own string>"]
    }}
  ],
  "raw_skills": ["<skill exactly as written>", "..."],
  "education": [
    {{
      "degree": "<degree name>",
      "institution": "<university or school name>",
      "year": "<graduation year or null>"
    }}
  ],
  "projects": [
    {{
      "name": "<project name>",
      "description": "<what it does in 1 sentence>",
      "technologies": ["<tech1>", "<tech2>"]
    }}
  ],
  "certifications": ["<certification name>"],
  "confidence_scores": {{
    "full_name": <0.0-1.0>,
    "email": <0.0-1.0>,
    "phone": <0.0-1.0>,
    "location": <0.0-1.0>,
    "total_yoe": <0.0-1.0>,
    "work_history": <0.0-1.0>,
    "raw_skills": <0.0-1.0>,
    "education": <0.0-1.0>,
    "projects": <0.0-1.0>,
    "certifications": <0.0-1.0>
  }}
}}

Confidence score rules:
- 1.0  = field is clearly and unambiguously present in the resume
- 0.7  = field is present but required inference or parsing
- 0.4  = field is partially present or uncertain
- 0.0  = field is absent or could not be determined"""

        last_exc: Exception | None = None
        for attempt in range(1, 4):
            try:
                response = await _client().chat.completions.create(
                    model=settings.AI_MODEL,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.0,
                    max_tokens=2000,
                )
                return json.loads(response.choices[0].message.content)
            except (json.JSONDecodeError, KeyError, ValueError) as exc:
                last_exc = exc
                logger.warning(
                    "extract_structured_profile attempt %d failed: %s", attempt, exc
                )

        raise RuntimeError(
            f"extract_structured_profile failed after 3 attempts: {last_exc}"
        )

    async def parse_jd_requirements(self, jd_text: str, job_title: str) -> dict:
        system = (
            "You are a precise JD requirements parser. "
            "Extract structured hiring requirements from job descriptions. "
            "Always respond with valid JSON only — no markdown, no prose."
        )

        user = f"""Parse this job description and extract structured hiring requirements.

JOB TITLE: {job_title}

JOB DESCRIPTION:
{jd_text[:4000]}

════════════════════════════════════════════════════
CRITICAL RULES — read carefully before responding
════════════════════════════════════════════════════

RULE 1 — SKILL GROUPS (most important):
Every technical skill requirement becomes a SkillGroup. The key question per requirement:
"Does the candidate need ALL these skills, or is ONE of them enough?"

  OR  → match_type = "any"  (candidate satisfies this group with ANY ONE skill)
  AND → match_type = "all"  (candidate must have ALL skills in the group)

  Required vs preferred:
  - Words like "must", "required", "essential", "strong experience in", "proficiency in" → required=true
  - Words like "nice to have", "preferred", "plus", "bonus", "ideally", "familiarity with" → required=false
  - required=false skills ALSO go into preferred_skills (flat list) for easy access

RULE 2 — RECOGNISE OR PATTERNS:
These all produce ONE SkillGroup with match_type="any":
  "Python or Java"              → skills: ["Python", "Java"],        match_type: "any"
  "React/Angular/Vue"           → skills: ["React", "Angular", "Vue"], match_type: "any"
  "either MySQL or PostgreSQL"  → skills: ["MySQL", "PostgreSQL"],   match_type: "any"
  "AWS or GCP cloud"            → skills: ["AWS", "GCP"],            match_type: "any"
  "experience in Java, Go, or Rust" → skills: ["Java", "Go", "Rust"], match_type: "any"

RULE 3 — RECOGNISE AND PATTERNS:
"React and TypeScript required" → TWO separate SkillGroups, each match_type="all"
  Group 1: skills: ["React"],      match_type: "all", required: true
  Group 2: skills: ["TypeScript"], match_type: "all", required: true

RULE 4 — PREFERRED SKILLS (never in required_skill_groups):
"Docker/Kubernetes is a plus"          → preferred_skills: ["Docker", "Kubernetes"]
"AWS or GCP experience preferred"      → preferred_skills: ["AWS", "GCP"]
"Familiarity with GraphQL is a bonus"  → preferred_skills: ["GraphQL"]
Never put preferred items into required_skill_groups.

RULE 5 — SENIORITY:
Infer seniority from the job title first, then explicit mentions, then years required:
  0-2 years   → Junior
  2-5 years   → Mid
  5-8 years   → Senior
  8-12 years  → Lead
  12+ years   → Principal
"Lead", "Staff", "Principal" in title → use those directly.

RULE 6 — EDUCATION:
Only extract if explicitly stated. "Degree preferred" → null (not required).
"Bachelor's required" → education_level: "Bachelor"

════════════════════════════════════════════════════

Return ONLY this JSON (no markdown, no extra text):
{{
  "seniority": "Junior|Mid|Senior|Lead|Principal|Executive or null",
  "industry": "<industry sector or null>",
  "job_function": "Engineering|Product|Data|Design|Marketing|Sales|Operations|Finance|Legal|HR or null",
  "min_years_experience": <integer or null>,
  "max_years_experience": <integer or null>,
  "education_level": "Diploma|Bachelor|Master|PhD or null",
  "education_field": "<field name or null>",
  "required_skill_groups": [
    {{
      "skills": ["<skill1>", "<skill2>"],
      "match_type": "any|all",
      "required": true,
      "context": "<exact phrase from JD that produced this group>"
    }}
  ],
  "preferred_skills": ["<skill1>", "<skill2>"],
  "key_responsibilities": ["<responsibility 1>", "<responsibility 2>", "<responsibility 3>"]
}}

Constraints:
- required_skill_groups must contain ONLY required=true groups
- preferred_skills is a flat deduped list — no duplicates from required_skill_groups
- key_responsibilities: at most 5 items, each under 15 words
- Normalise skill names to common canonical form (e.g. "ReactJS" → "React", "Postgres" → "PostgreSQL")"""

        last_exc: Exception | None = None
        for attempt in range(1, 4):
            try:
                response = await _client().chat.completions.create(
                    model=settings.AI_MODEL,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.0,
                    max_tokens=1500,
                )
                return json.loads(response.choices[0].message.content)
            except (json.JSONDecodeError, KeyError, ValueError) as exc:
                last_exc = exc
                logger.warning("parse_jd_requirements attempt %d failed: %s", attempt, exc)

        raise RuntimeError(
            f"parse_jd_requirements failed after 3 attempts: {last_exc}"
        )

    async def generate_career_profile(self, resume_text: str) -> dict:
        prompt = f"""You are a senior engineering career coach. Analyse this resume and produce a structured career profile.

RESUME:
{resume_text[:4000]}

Tasks:
1. Identify the candidate's current role title and seniority level (e.g. "Junior SDE", "SDE 2 / Mid-Level", "SDE 3 / Senior", "Staff Engineer", "Engineering Manager").
2. Determine the natural next career step (e.g. SDE 1 → SDE 2, SDE 2 → SDE 3 / Senior, Senior → Staff/Lead).
3. List 4-6 concrete strengths visible in the resume (specific skills, technologies, or demonstrated behaviors).
4. List 3-5 weaknesses or gaps that would hold them back at the next level.
5. For the upgrade path, list 3-5 skill areas they must develop to reach the next level. Each area must have:
   - area: the broad skill area name
   - why: one sentence on why it matters at the next level
   - sub_skills: 3-5 concrete, actionable sub-skills or topics to learn/practice

Return ONLY this JSON (no markdown, no extra text):
{{
  "detected_role": "<current job title as written in resume>",
  "detected_level_label": "<e.g. Mid-Level Software Engineer (SDE 2)>",
  "next_level_label": "<e.g. Senior Software Engineer (SDE 3)>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>", "<strength 4>"],
  "weaknesses": ["<weakness 1>", "<weakness 2>", "<weakness 3>"],
  "upgrade_path": [
    {{
      "area": "<skill area name>",
      "why": "<one sentence on why this matters at the next level>",
      "sub_skills": ["<concrete sub-skill 1>", "<concrete sub-skill 2>", "<concrete sub-skill 3>"]
    }}
  ],
  "summary": "<2-3 sentences: where they stand today and the one most important thing to focus on>"
}}

Be specific. Use the actual technologies from their resume. Avoid generic advice."""

        response = await _client().chat.completions.create(
            model=settings.AI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=1200,
        )
        return json.loads(response.choices[0].message.content)

    async def answer_question(self, context: str, question: str) -> str:
        prompt = f"""{context}

{question}"""
        response = await _client().chat.completions.create(
            model=settings.AI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=600,
        )
        return response.choices[0].message.content
