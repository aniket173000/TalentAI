"""
Outreach agent — turns a pasted hiring post (e.g. a LinkedIn job post) into a
ready-to-send Nideknil pitch.

Two steps, both a single LLM call:
  1. extract_from_post()  → {hiring_email, roles[], company, contact_name, context}
  2. draft_email()        → {subject, body}

Uses a free-tier LLM by default (Gemini / Groq) so this never touches the paid
ranking budget. Provider is settings.OUTREACH_LLM_PROVIDER.

Nothing here sends email — the router does that only after an admin approves, so
a wrong extraction or a hallucinated detail can never auto-fire.
"""
import json
import logging
import re

import httpx

from config import settings

logger = logging.getLogger(__name__)


class OutreachError(Exception):
    """Raised with a human-readable message the router surfaces to the admin UI."""


# ── LLM plumbing ────────────────────────────────────────────────────────────────

async def _call_llm(prompt: str, *, json_mode: bool, max_tokens: int = 1200) -> str:
    """Call the configured provider, falling back to Gemini if it fails.

    Outreach runs on free tiers, which are flaky (bad keys, rate limits, JSON
    validation quirks). Rather than 500 the admin UI, degrade to Gemini when the
    primary provider errors and a Gemini key is available.
    """
    primary = (settings.OUTREACH_LLM_PROVIDER or "gemini").lower()
    try:
        return await _call_provider(primary, prompt, json_mode=json_mode, max_tokens=max_tokens)
    except OutreachError as exc:
        if primary != "gemini" and settings.GEMINI_API_KEY:
            logger.warning("Outreach primary provider %s failed (%s); falling back to Gemini.", primary, exc)
            return await _call_provider("gemini", prompt, json_mode=json_mode, max_tokens=max_tokens)
        raise


async def _call_provider(provider: str, prompt: str, *, json_mode: bool, max_tokens: int = 1200) -> str:
    if provider == "gemini":
        if not settings.GEMINI_API_KEY:
            raise OutreachError(
                "Gemini API key not set. Add GEMINI_API_KEY to the backend .env "
                "(free key at https://aistudio.google.com/apikey)."
            )
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
        )
        gen_cfg: dict = {"temperature": 0.6, "maxOutputTokens": max_tokens}
        if json_mode:
            gen_cfg["responseMimeType"] = "application/json"
        payload = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": gen_cfg}
        async with httpx.AsyncClient(timeout=45) as client:
            r = await client.post(url, json=payload)
        if r.status_code != 200:
            raise OutreachError(f"Gemini request failed ({r.status_code}): {r.text[:300]}")
        data = r.json()
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError):
            raise OutreachError(f"Unexpected Gemini response: {json.dumps(data)[:300]}")

    if provider == "groq":
        if not settings.GROQ_API_KEY:
            raise OutreachError(
                "Groq API key not set. Add GROQ_API_KEY to the backend .env "
                "(free key at https://console.groq.com/keys)."
            )
        body: dict = {
            "model": settings.GROQ_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.6,
            "max_tokens": max_tokens,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        async with httpx.AsyncClient(timeout=45) as client:
            r = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                json=body,
            )
        if r.status_code == 200:
            return r.json()["choices"][0]["message"]["content"]

        # Groq validates JSON server-side in json_object mode. Llama models often
        # wrap output in a ```json fence, which fails that check with a 400 even
        # though the content is usable — salvage it (our _parse_json strips fences).
        if r.status_code == 400 and json_mode:
            try:
                err = r.json().get("error", {})
            except Exception:  # noqa: BLE001
                err = {}
            if err.get("code") == "json_validate_failed" and err.get("failed_generation"):
                return err["failed_generation"]
        raise OutreachError(f"Groq request failed ({r.status_code}): {r.text[:300]}")

    if provider == "openai":
        if not settings.OPENAI_API_KEY:
            raise OutreachError("OPENAI_API_KEY not set for the outreach agent.")
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        resp = await client.chat.completions.create(
            model=settings.AI_MODEL_MINI,
            messages=[{"role": "user", "content": prompt}],
            **({"response_format": {"type": "json_object"}} if json_mode else {}),
        )
        return resp.choices[0].message.content or ""

    raise OutreachError(f"Unknown OUTREACH_LLM_PROVIDER: {provider!r}")


def _parse_json(text: str) -> dict:
    """Tolerant JSON parse — strips ``` fences and grabs the first {...} block.

    Also repairs the common truncation case (model hit max_tokens mid-object, so
    the closing brace/quote is missing) by trimming to the last complete field.
    """
    t = (text or "").strip()
    # Strip a ```json … ``` (or bare ```) fence if present.
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*", "", t)
        t = re.sub(r"\s*```$", "", t).strip()

    # 1. Straight parse.
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        pass

    # 2. Grab the outermost {...} block, greedy to the last brace.
    m = re.search(r"\{.*\}", t, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass

    # 3. Truncated object (no closing brace): keep only the COMPLETE
    #    "key": <value> pairs and close the object, so a cut-off draft still
    #    yields the fields that did make it through. An incomplete trailing
    #    field (e.g. a half-written string) is dropped rather than corrupt the parse.
    if t.lstrip().startswith("{"):
        value = r'(?:"(?:[^"\\]|\\.)*"|\[[^\]]*\]|-?\d+(?:\.\d+)?|true|false|null)'
        pairs = re.findall(r'"[^"]+"\s*:\s*' + value, t)
        if pairs:
            try:
                return json.loads("{" + ",".join(p.strip() for p in pairs) + "}")
            except json.JSONDecodeError:
                pass

    logger.error("Outreach LLM returned unparseable output (%d chars): %r", len(t), t[:800])
    raise OutreachError(f"Model did not return valid JSON. Got: {t[:200]!r}")


_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")


# ── Steps ───────────────────────────────────────────────────────────────────────

async def extract_from_post(source_text: str) -> dict:
    prompt = (
        "You are parsing a hiring/job post (often copied from LinkedIn). Extract "
        "contact and role details. Return ONLY JSON with these keys:\n"
        '{"hiring_email": string|null, "contact_name": string|null, '
        '"company": string|null, "roles": [string], "context": string}\n'
        "- hiring_email: the email a candidate should apply to, if present.\n"
        "- contact_name: the person who posted / to address, if identifiable.\n"
        "- roles: the specific role titles they are hiring for.\n"
        "- context: one sentence on what the company does / why it's notable.\n\n"
        f"POST:\n{source_text.strip()[:6000]}"
    )
    data = _parse_json(await _call_llm(prompt, json_mode=True, max_tokens=500))

    # Regex safety net: if the model missed the email but one is in the text, use it.
    if not data.get("hiring_email"):
        m = _EMAIL_RE.search(source_text)
        if m:
            data["hiring_email"] = m.group(0)
    if isinstance(data.get("roles"), str):
        data["roles"] = [data["roles"]]
    data.setdefault("roles", [])
    return data


async def draft_email(fields: dict) -> dict:
    roles = ", ".join(fields.get("roles") or []) or "the roles you're hiring for"
    company = fields.get("company") or "your team"
    name = fields.get("contact_name") or "there"
    context = fields.get("context") or ""

    prompt = (
        "Write a short, warm B2B cold email from the founder of Nideknil "
        "(nideknil.in) to a company that is hiring, pitching Nideknil as the way "
        "to fill their open roles.\n\n"
        "About Nideknil (use naturally, don't list all of it):\n"
        "- 'LinkedIn' reversed — hiring that works for recruiters AND candidates.\n"
        "- Paste a JD, get a ranked, EXPLAINABLE shortlist in minutes (not a resume pile). "
        "Postgres+pgvector recall, Cohere rerank, LLM judge on the top candidates.\n"
        "- Rates each candidate's AI fluency — how well they work WITH AI.\n"
        "- AI-native take-homes over an MCP integration: candidates complete a task inside "
        "Claude and we score HOW they used AI (cheat-resistant).\n"
        "- Offer: run their roles free as a pilot; they keep the shortlist, no strings.\n\n"
        "Rules:\n"
        "- Reference their specific roles and company so it's clearly personal.\n"
        "- Punchy, human, ~150-190 words. No buzzword soup. One clear CTA (a quick call).\n"
        "- Format for readability: a one-line greeting, then 2-3 SHORT paragraphs, then\n"
        "  the sign-off — each separated by a blank line (use real newline characters).\n"
        "- Sign off on its own lines as:\nAniket\nFounder, Nideknil — nideknil.in\n"
        "- Plain text only (no markdown, no HTML).\n"
        "Return ONLY JSON: {\"subject\": string, \"body\": string}\n\n"
        f"Recipient name: {name}\nCompany: {company}\nRoles: {roles}\nContext: {context}"
    )
    data = _parse_json(await _call_llm(prompt, json_mode=True, max_tokens=900))
    if not data.get("subject") or not data.get("body"):
        raise OutreachError("Draft came back incomplete — try again.")
    return {"subject": data["subject"].strip(), "body": data["body"].strip()}


async def analyze_and_draft(source_text: str) -> dict:
    """Full pipeline used by POST /outreach/draft."""
    if not source_text or len(source_text.strip()) < 30:
        raise OutreachError("Paste the full hiring post — that's too short to parse.")
    fields = await extract_from_post(source_text)
    draft = await draft_email(fields)
    return {**fields, **draft}
