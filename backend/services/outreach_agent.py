"""
Outreach agent — turns a pasted hiring post (e.g. a LinkedIn job post) into a
ready-to-send Nideknil pitch.

Two steps, both a single LLM call:
  1. extract_from_post()  → {hiring_email, roles[], company, contact_name, context}
  2. draft_email()        → {subject, body}

LLM plumbing (provider stack + tolerant JSON parsing) lives in services/llm_lite.py,
shared with the candidate Cold Email agent. Uses a free-tier LLM by default
(Gemini / Groq) so this never touches the paid ranking budget.

Nothing here sends email — the router does that only after an admin approves, so
a wrong extraction or a hallucinated detail can never auto-fire.
"""
import re

from services.llm_lite import (
    EMAIL_RE as _EMAIL_RE,
    LLMLiteError as OutreachError,
    call_llm as _call_llm,
    parse_json as _parse_json,
)


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
