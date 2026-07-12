"""
Redis-backed response cache for OpenAI calls.

Wraps the two API surfaces every OpenAIStrategy method funnels through
(chat.completions.create, embeddings.create) so identical requests — most
notably re-ranking an unchanged (job, candidate) pair across funnel runs —
are served from Redis instead of hitting OpenAI again.

Fails open: any Redis error falls through to a real API call, never blocks it.
"""
import asyncio
import hashlib
import json
import logging

from config import settings

logger = logging.getLogger(__name__)

_CACHE_KEY_VERSION = "v1"  # bump to invalidate every cached entry at once

# (client, event loop) the client was built on — redis-asyncio connections are
# bound to the loop they were created in. services/funnel.py's Celery task path
# calls asyncio.run() fresh per task, so a worker process reuses this module
# across multiple short-lived loops; rebuild the client if the loop changed.
_client_state: dict = {"client": None, "loop": None}


def _redis_client():
    import redis.asyncio as aioredis

    try:
        running_loop = asyncio.get_running_loop()
    except RuntimeError:
        running_loop = None

    if _client_state["client"] is None or _client_state["loop"] is not running_loop:
        kwargs = {"socket_connect_timeout": 2, "socket_timeout": 2}
        if settings.LLM_CACHE_REDIS_URL.startswith("rediss://"):
            import ssl
            kwargs["ssl_cert_reqs"] = ssl.CERT_NONE
        _client_state["client"] = aioredis.from_url(settings.LLM_CACHE_REDIS_URL, **kwargs)
        _client_state["loop"] = running_loop

    return _client_state["client"]


def _cache_key(kind: str, **parts) -> str:
    canonical = json.dumps(parts, sort_keys=True, default=str)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"llmcache:{_CACHE_KEY_VERSION}:{kind}:{digest}"


async def cached_chat_completion(
    client,
    *,
    model: str,
    messages: list,
    reasoning_effort: str | None = None,
    response_format: dict | None = None,
    **kwargs,
) -> str:
    """
    Returns the chat completion's message content string. Every current caller
    only ever reads response.choices[0].message.content, so that's all this
    caches — not a mimicked SDK response object.
    """
    key = _cache_key(
        "chat",
        model=model,
        messages=messages,
        reasoning_effort=reasoning_effort,
        response_format=response_format,
    )
    is_json = bool(response_format and response_format.get("type") == "json_object")

    if settings.LLM_CACHE_ENABLED:
        try:
            r = _redis_client()
            cached = await r.get(key)
            if cached is not None:
                return cached.decode("utf-8") if isinstance(cached, bytes) else cached
        except Exception as exc:  # noqa: BLE001 — fail open
            logger.warning("LLM cache GET failed, calling API directly: %s", exc)

    call_kwargs = {"model": model, "messages": messages, **kwargs}
    if reasoning_effort is not None:
        call_kwargs["reasoning_effort"] = reasoning_effort
    if response_format is not None:
        call_kwargs["response_format"] = response_format

    response = await client.chat.completions.create(**call_kwargs)
    content = response.choices[0].message.content

    if settings.LLM_CACHE_ENABLED:
        # Only cache a JSON response if it actually parses — OpenAI occasionally
        # returns truncated/malformed JSON, and callers retry on that. Caching a
        # broken response would poison every subsequent identical call for the
        # full TTL instead of letting the existing retry logic recover.
        cacheable = True
        if is_json:
            try:
                json.loads(content)
            except Exception:
                cacheable = False

        if cacheable:
            try:
                r = _redis_client()
                await r.setex(key, settings.LLM_CACHE_TTL_SECONDS, content)
            except Exception as exc:  # noqa: BLE001 — fail open
                logger.warning("LLM cache SETEX failed (non-fatal): %s", exc)

    return content


async def cached_embedding(client, *, model: str, text: str) -> list[float]:
    """Returns the embedding vector for `text` under `model`."""
    key = _cache_key("embed", model=model, text=text)

    if settings.LLM_CACHE_ENABLED:
        try:
            r = _redis_client()
            cached = await r.get(key)
            if cached is not None:
                return json.loads(cached)
        except Exception as exc:  # noqa: BLE001 — fail open
            logger.warning("LLM cache GET failed, calling API directly: %s", exc)

    response = await client.embeddings.create(model=model, input=text)
    embedding = response.data[0].embedding

    if settings.LLM_CACHE_ENABLED:
        try:
            r = _redis_client()
            await r.setex(key, settings.LLM_CACHE_EMBEDDING_TTL_SECONDS, json.dumps(embedding))
        except Exception as exc:  # noqa: BLE001 — fail open
            logger.warning("LLM cache SETEX failed (non-fatal): %s", exc)

    return embedding
