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
                          evaluation_focus: str | None) -> dict:
        return await self._complete_json(
            CHUNK_SYSTEM,
            build_chunk_prompt(chunk_text, assignment_brief, evaluation_focus),
            model=self.chunk_model,
            max_tokens=2_000,
        )

    async def score_chunks(self, chunks: list[str], assignment_brief: str,
                           evaluation_focus: str | None) -> list[dict]:
        """
        Score all chunks concurrently under a semaphore. Individual chunk
        failures are tolerated (logged, skipped) as long as at least one
        chunk succeeds — a 40-session submission shouldn't die on one 500.
        """
        sem = asyncio.Semaphore(settings.FLUENCY_CHUNK_CONCURRENCY)

        async def _one(i: int, chunk: str):
            async with sem:
                try:
                    result = await self.score_chunk(chunk, assignment_brief, evaluation_focus)
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
                        evaluation_focus: str | None) -> dict:
        return await self._complete_json(
            AGGREGATE_SYSTEM,
            build_aggregate_prompt(chunk_results, metrics, integrity_flags,
                                   assignment_brief, evaluation_focus),
            model=self.aggregate_model,
            max_tokens=4_000,
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
            temperature=0.2,
            max_tokens=max_tokens,
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

    async def _complete_json(self, system: str, user: str, model: str,
                             max_tokens: int) -> dict:
        import anthropic
        if not settings.ANTHROPIC_API_KEY:
            raise FluencyJudgeError("ANTHROPIC_API_KEY is not set")
        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return _parse_json_reply(resp.content[0].text)


@lru_cache(maxsize=2)
def get_fluency_judge(provider: str | None = None) -> FluencyJudge:
    p = (provider or settings.FLUENCY_AI_PROVIDER or settings.AI_PROVIDER).lower()
    if p == "openai":
        return OpenAIFluencyJudge()
    if p == "claude":
        return ClaudeFluencyJudge()
    raise ValueError(f"Unknown fluency judge provider {p!r}")
