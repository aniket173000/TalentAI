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


# ── Branded signature ─────────────────────────────────────────────────────────
# The draft body ends on the CTA; this signature is appended at send time so every
# outreach email carries consistent Nideknil branding (name, links, tagline).

SIGNATURE_NAME = "Aniket Shrivastav"
SIGNATURE_TITLE = "Founder, Nideknil"
SIGNATURE_EMAIL = "talent@nideknil.in"
SIGNATURE_SITE = "nideknil.in"
SIGNATURE_TAGLINE = "Hiring, reversed."
_SKY = "#4CB2FF"

# Sign-offs the model sometimes appends despite instructions — strip them so the
# branded signature isn't duplicated. Only matches a closing word ALONE on its own
# line (e.g. "Best," / "Thanks,") so a real CTA like "Thanks for your time — call?"
# is left intact.
_SIGNOFF_RE = re.compile(
    r"\n+[ \t]*(best regards|warm regards|kind regards|best|regards|cheers|"
    r"thanks|thank you|sincerely|talk soon|looking forward)[ \t]*[,.!]?[ \t]*\n.*$",
    re.IGNORECASE | re.DOTALL,
)


def _strip_stray_signoff(body: str) -> str:
    """Drop a trailing 'Best,\\nAniket …' the model may have added on its own."""
    return _SIGNOFF_RE.sub("", body).rstrip()


def signature_text() -> str:
    return (
        "Best,\n"
        f"{SIGNATURE_NAME}\n"
        f"{SIGNATURE_TITLE}\n"
        f"{SIGNATURE_EMAIL} · {SIGNATURE_SITE}\n"
        f"{SIGNATURE_TAGLINE}"
    )


def _esc(s: str) -> str:
    return (
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )


def signature_html() -> str:
    """HTML signature mirroring the brand block: styled wordmark + tagline.

    Uses CSS-styled text for the wordmark rather than an <img>/SVG — Gmail and most
    clients strip SVG and block remote images by default, so text always renders.
    """
    return (
        '<table cellpadding="0" cellspacing="0" border="0" '
        'style="margin-top:20px;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;">'
        '<tr><td style="border-left:3px solid ' + _SKY + ';padding:2px 0 2px 12px;">'
        f'<div style="font-size:16px;font-weight:700;color:#111827;line-height:1.4;">{_esc(SIGNATURE_NAME)}</div>'
        f'<div style="font-size:13px;color:#6b7280;line-height:1.5;">{_esc(SIGNATURE_TITLE)}</div>'
        '<div style="font-size:13px;line-height:1.6;">'
        f'<a href="mailto:{SIGNATURE_EMAIL}" style="color:{_SKY};text-decoration:none;">{SIGNATURE_EMAIL}</a>'
        '<span style="color:#9ca3af;"> · </span>'
        f'<a href="https://{SIGNATURE_SITE}" style="color:{_SKY};text-decoration:none;">{SIGNATURE_SITE}</a>'
        '</div>'
        '<div style="margin-top:8px;font-size:18px;font-weight:700;letter-spacing:-0.04em;">'
        f'<span style="color:#111827;">Ni</span><span style="color:{_SKY};">deknil</span>'
        '</div>'
        f'<div style="font-size:12px;color:#9ca3af;font-style:italic;">{_esc(SIGNATURE_TAGLINE)}</div>'
        '</td></tr></table>'
    )


def build_email_html(body_text: str) -> str:
    """Wrap a plain-text outreach body as HTML paragraphs + append the signature."""
    blocks = [b.strip() for b in re.split(r"\n\s*\n", body_text.strip()) if b.strip()]
    paras = "".join(
        f'<p style="margin:0 0 14px;">{_esc(b).replace(chr(10), "<br>")}</p>' for b in blocks
    )
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;'
        'color:#1f2937;line-height:1.6;max-width:600px;">'
        f'{paras}{signature_html()}'
        '</div>'
    )


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
        "What Nideknil gives a hiring team (pick the 3-4 most relevant to THEIR roles, "
        "describe them as outcomes — never mention the underlying tech/infrastructure):\n"
        "- Pool hiring in seconds: paste a role, get a ranked shortlist of candidates almost "
        "instantly — with a clear, plain-English reason for every ranking, not a black box.\n"
        "- Ranked candidates FREE for every job you post — you always keep the shortlist.\n"
        "- Global rank search: search a worldwide pool and see where any candidate ranks for your role.\n"
        "- Instant feedback for rejected candidates — they get useful, automatic feedback, so your "
        "employer brand stays strong instead of ghosting people.\n"
        "- AI-native take-homes over our MCP integration: candidates do a real task right inside "
        "Claude and we score HOW they used AI — cheat-resistant, and a true signal of skill.\n"
        "- The only platform built to hire AI-first builders — people who are superhuman WITH AI, "
        "not just around it. We rate how well each candidate actually works with AI.\n"
        "- Offer: run their open roles through Nideknil FREE as a pilot; they keep the shortlist, no strings.\n\n"
        "Subject line rules:\n"
        "- MUST include the word 'Nideknil' and reference their specific role.\n"
        "- Frame it as an invitation to hire with Nideknil, e.g. 'Hire your <role> with Nideknil — a ranked "
        "shortlist, free' or 'Nideknil: your <role> shortlist, ranked in seconds'. Keep it under ~70 chars.\n\n"
        "Body rules:\n"
        "- Reference their specific role(s) and company so it's clearly personal.\n"
        "- Punchy, human, ~150-190 words. Benefit-led, NO buzzword soup, NO technical/infra terms.\n"
        "- One clear CTA (a quick 15-minute call).\n"
        "- Format for readability: a one-line greeting, then 2-3 SHORT paragraphs (blank line between "
        "each, use real newline characters), ending on the CTA question.\n"
        "- Do NOT write any sign-off, closing, name, or signature — a branded signature is added "
        "automatically. End with the CTA line and nothing after it.\n"
        "- Plain text only (no markdown, no HTML).\n"
        "Return ONLY JSON: {\"subject\": string, \"body\": string}\n\n"
        f"Recipient name: {name}\nCompany: {company}\nRoles: {roles}\nContext: {context}"
    )
    data = _parse_json(await _call_llm(prompt, json_mode=True, max_tokens=900))
    if not data.get("subject") or not data.get("body"):
        raise OutreachError("Draft came back incomplete — try again.")
    return {"subject": data["subject"].strip(), "body": _strip_stray_signoff(data["body"].strip())}


async def analyze_and_draft(source_text: str) -> dict:
    """Full pipeline used by POST /outreach/draft."""
    if not source_text or len(source_text.strip()) < 30:
        raise OutreachError("Paste the full hiring post — that's too short to parse.")
    fields = await extract_from_post(source_text)
    draft = await draft_email(fields)
    return {**fields, **draft}
