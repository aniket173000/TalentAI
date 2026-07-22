"""
Shared free-tier LLM plumbing for the lightweight agents (admin Outreach,
candidate Cold Email). Extracted from services/outreach_agent.py so both agents
use one provider stack: Gemini / Groq / OpenAI with automatic Gemini fallback,
plus a JSON parser tolerant of fences and max_token truncation.

Provider default is settings.OUTREACH_LLM_PROVIDER — free tiers, so nothing here
touches the paid ranking budget.
"""
import json
import logging
import re

import httpx

from config import settings

logger = logging.getLogger(__name__)


class LLMLiteError(Exception):
    """Raised with a human-readable message the calling router can surface."""


async def call_llm(prompt: str, *, json_mode: bool, max_tokens: int = 1200) -> str:
    """Call the configured provider, falling back to Gemini if it fails.

    Free tiers are flaky (bad keys, rate limits, JSON validation quirks).
    Rather than 500 the UI, degrade to Gemini when the primary provider errors
    and a Gemini key is available.
    """
    primary = (settings.OUTREACH_LLM_PROVIDER or "gemini").lower()
    try:
        return await _call_provider(primary, prompt, json_mode=json_mode, max_tokens=max_tokens)
    except LLMLiteError as exc:
        if primary != "gemini" and settings.GEMINI_API_KEY:
            logger.warning("llm_lite primary provider %s failed (%s); falling back to Gemini.", primary, exc)
            return await _call_provider("gemini", prompt, json_mode=json_mode, max_tokens=max_tokens)
        raise


async def _call_provider(provider: str, prompt: str, *, json_mode: bool, max_tokens: int = 1200) -> str:
    if provider == "gemini":
        if not settings.GEMINI_API_KEY:
            raise LLMLiteError(
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
            raise LLMLiteError(f"Gemini request failed ({r.status_code}): {r.text[:300]}")
        data = r.json()
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError):
            raise LLMLiteError(f"Unexpected Gemini response: {json.dumps(data)[:300]}")

    if provider == "groq":
        if not settings.GROQ_API_KEY:
            raise LLMLiteError(
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
        # though the content is usable — salvage it (parse_json strips fences).
        if r.status_code == 400 and json_mode:
            try:
                err = r.json().get("error", {})
            except Exception:  # noqa: BLE001
                err = {}
            if err.get("code") == "json_validate_failed" and err.get("failed_generation"):
                return err["failed_generation"]
        raise LLMLiteError(f"Groq request failed ({r.status_code}): {r.text[:300]}")

    if provider == "openai":
        if not settings.OPENAI_API_KEY:
            raise LLMLiteError("OPENAI_API_KEY not set for the lite LLM agents.")
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        resp = await client.chat.completions.create(
            model=settings.AI_MODEL_MINI,
            messages=[{"role": "user", "content": prompt}],
            **({"response_format": {"type": "json_object"}} if json_mode else {}),
        )
        return resp.choices[0].message.content or ""

    raise LLMLiteError(f"Unknown OUTREACH_LLM_PROVIDER: {provider!r}")


def parse_json(text: str) -> dict:
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

    logger.error("llm_lite returned unparseable output (%d chars): %r", len(t), t[:800])
    raise LLMLiteError(f"Model did not return valid JSON. Got: {t[:200]!r}")


EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
