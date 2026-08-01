"""
FluencyJudge — provider abstraction for the transcript-scoring LLM.

Mirrors the platform's AIStrategy pattern (services/ai/) but scoped to this
feature so the judge provider can differ from the rest of the app:
FLUENCY_AI_PROVIDER overrides AI_PROVIDER when set.

OpenAI is the mainstream path today; ClaudeFluencyJudge is fully implemented
and activates by config the day Anthropic credits are available — no code
changes required.
"""
from __future__ import annotations

import asyncio
import json
import logging
from abc import ABC, abstractmethod
from functools import lru_cache

from config import settings
from services.fluency.prompts import (
    AGGREGATE_SYSTEM,
    CHUNK_SYSTEM,
    GENERAL_WORK_AGGREGATE_SYSTEM,
    GENERAL_WORK_CHUNK_SYSTEM,
    build_aggregate_prompt,
    build_chunk_prompt,
)

logger = logging.getLogger(__name__)


class FluencyJudgeError(Exception):
    """Raised when the judge cannot produce a usable result."""


def _parse_json_reply(text: str) -> dict:
    """Parse a model reply that should be JSON, tolerating markdown fences."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text)


class FluencyJudge(ABC):
    provider: str
    chunk_model: str
    aggregate_model: str

    @abstractmethod
    async def _complete_json(self, system: str, user: str, model: str,
                             max_tokens: int) -> dict: ...

    async def score_chunk(self, chunk_text: str, assignment_brief: str,
                          evaluation_focus: str | None,
                          general_work: bool = False) -> dict:
        return await self._complete_json(
            GENERAL_WORK_CHUNK_SYSTEM if general_work else CHUNK_SYSTEM,
            build_chunk_prompt(chunk_text, assignment_brief, evaluation_focus,
                               general_work=general_work),
            model=self.chunk_model,
            max_tokens=3_000,
        )

    async def score_chunks(self, chunks: list[str], assignment_brief: str,
                           evaluation_focus: str | None,
                           general_work: bool = False) -> list[dict]:
        """
        Score all chunks concurrently under a semaphore. Individual chunk
        failures are tolerated (logged, skipped) as long as at least one
        chunk succeeds — a 40-session submission shouldn't die on one 500.

        general_work=True selects the brief-free "real day-to-day work" framing
        used by the Pulse team product; False keeps the hiring path unchanged.
        """
        sem = asyncio.Semaphore(settings.FLUENCY_CHUNK_CONCURRENCY)

        async def _one(i: int, chunk: str):
            async with sem:
                try:
                    result = await self.score_chunk(chunk, assignment_brief,
                                                    evaluation_focus, general_work)
                    result["chunk_index"] = i
                    return result
                except Exception as exc:
                    logger.warning("Fluency chunk %s failed: %s", i, exc)
                    return None

        results = await asyncio.gather(*(_one(i, c) for i, c in enumerate(chunks)))
        ok = [r for r in results if r is not None]
        if not ok:
            raise FluencyJudgeError("All transcript chunks failed to score")
        if len(ok) < len(chunks):
            logger.warning("Fluency: %d/%d chunks scored", len(ok), len(chunks))
        return ok

    async def aggregate(self, chunk_results: list[dict], metrics: dict,
                        integrity_flags: list[dict], assignment_brief: str,
                        evaluation_focus: str | None,
                        general_work: bool = False) -> dict:
        return await self._complete_json(
            GENERAL_WORK_AGGREGATE_SYSTEM if general_work else AGGREGATE_SYSTEM,
            build_aggregate_prompt(chunk_results, metrics, integrity_flags,
                                   assignment_brief, evaluation_focus,
                                   general_work=general_work),
            model=self.aggregate_model,
            max_tokens=6_000,
        )


class OpenAIFluencyJudge(FluencyJudge):
    provider = "openai"

    def __init__(self):
        self.chunk_model = settings.FLUENCY_CHUNK_MODEL
        self.aggregate_model = settings.FLUENCY_AGGREGATE_MODEL

    async def _complete_json(self, system: str, user: str, model: str,
                             max_tokens: int) -> dict:
        from openai import AsyncOpenAI
        if not settings.OPENAI_API_KEY:
            raise FluencyJudgeError("OPENAI_API_KEY is not set")
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        resp = await client.chat.completions.create(
            model=model,
            # GPT-5 reasoning models: max_completion_tokens (not max_tokens) and no
            # custom temperature. Budget must leave room for reasoning + output tokens.
            max_completion_tokens=max_tokens,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return _parse_json_reply(resp.choices[0].message.content)


class ClaudeFluencyJudge(FluencyJudge):
    provider = "claude"

    def __init__(self):
        self.chunk_model = settings.FLUENCY_CHUNK_MODEL_CLAUDE
        self.aggregate_model = settings.FLUENCY_AGGREGATE_MODEL_CLAUDE
        self._client = None

    def _get_client(self):
        """One AsyncAnthropic per judge instance — score_chunks fans out dozens
        of concurrent calls and a client per call would mean a connection pool
        per call. The judge itself is lru_cached, so this lives for the process.
        """
        if self._client is None:
            import anthropic
            if not settings.ANTHROPIC_API_KEY:
                raise FluencyJudgeError("ANTHROPIC_API_KEY is not set")
            self._client = anthropic.AsyncAnthropic(
                api_key=settings.ANTHROPIC_API_KEY)
        return self._client

    async def _complete_json(self, system: str, user: str, model: str,
                             max_tokens: int) -> dict:
        client = self._get_client()
        resp = await client.messages.create(
            model=model,
            # Thinking counts against max_tokens on the reasoning models, so the
            # caller's budget is for the JSON alone — add reasoning room on top.
            max_tokens=max_tokens + settings.FLUENCY_CLAUDE_THINKING_TOKENS,
            system=system,
            messages=[{"role": "user", "content": user}],
        )

        # Safety classifiers can decline with a 200 + empty/partial content;
        # surface that as a judge error rather than a JSONDecodeError.
        if resp.stop_reason == "refusal":
            category = getattr(resp.stop_details, "category", None)
            raise FluencyJudgeError(
                f"Claude declined to score this content (category={category})")
        if resp.stop_reason == "max_tokens":
            raise FluencyJudgeError(
                f"Judge reply truncated at {max_tokens} tokens on {model} — "
                "raise FLUENCY_CLAUDE_THINKING_TOKENS")

        # Thinking blocks precede the answer, so the reply is not content[0].
        text = "".join(b.text for b in resp.content if b.type == "text")
        if not text.strip():
            raise FluencyJudgeError(
                f"Judge returned no text content on {model} "
                f"(stop_reason={resp.stop_reason})")
        return _parse_json_reply(text)


@lru_cache(maxsize=2)
def get_fluency_judge(provider: str | None = None) -> FluencyJudge:
    p = (provider or settings.FLUENCY_AI_PROVIDER or settings.AI_PROVIDER).lower()
    if p == "openai":
        return OpenAIFluencyJudge()
    if p == "claude":
        return ClaudeFluencyJudge()
    raise ValueError(f"Unknown fluency judge provider {p!r}")
