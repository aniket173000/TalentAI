"""
Embedding provider hierarchy.

OCP  — add a new provider by subclassing EmbedderBase; nothing else changes.
DIP  — SkillMatcher depends on EmbedderBase, not a concrete class.
Decorator — CachedEmbedder wraps any EmbedderBase with transparent caching;
             caching is a separate concern from embedding (SRP).

Provider map (set SEMANTIC_EMBEDDER in .env):
  "openai"               — OpenAI text-embedding-3-small (default, needs API key)
  "sentence_transformer" — all-MiniLM-L6-v2 local model (pip install sentence-transformers)
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from functools import lru_cache

from config import settings
from services.semantic.cache import EmbeddingCache

logger = logging.getLogger(__name__)


# ── Abstract base (Interface Segregation) ─────────────────────────────────────

class EmbedderBase(ABC):
    """Contract every embedding provider must satisfy."""

    @abstractmethod
    async def embed_text(self, text: str) -> list[float]:
        """Return a dense float vector for a single input string."""

    @abstractmethod
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """
        Return one embedding per input, preserving order.
        Implementations should use a native batch API where available
        to minimise round-trips and stay within the p95 < 2s latency target.
        """


# ── OpenAI implementation ─────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _openai_client():
    from openai import AsyncOpenAI
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set.")
    return AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


class OpenAIEmbedder(EmbedderBase):
    """
    Embedder backed by OpenAI text-embedding-3-small (1536-d).
    Uses the batch endpoint for all multi-text calls — single HTTP round-trip
    regardless of input count, keeping latency predictable.
    """

    _MAX_BATCH = 2048  # OpenAI hard limit per request

    async def embed_text(self, text: str) -> list[float]:
        results = await self.embed_batch([text])
        return results[0]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        embeddings: list[list[float]] = []
        # Chunk into OpenAI's max batch size
        for i in range(0, len(texts), self._MAX_BATCH):
            chunk = texts[i: i + self._MAX_BATCH]
            response = await _openai_client().embeddings.create(
                model=settings.EMBEDDING_MODEL,
                input=[t[:8000] for t in chunk],  # hard-truncate to avoid token limit
            )
            # OpenAI returns results sorted by index
            chunk_embs = [item.embedding for item in sorted(response.data, key=lambda x: x.index)]
            embeddings.extend(chunk_embs)

        return embeddings


# ── SentenceTransformer implementation ────────────────────────────────────────

class SentenceTransformerEmbedder(EmbedderBase):
    """
    Embedder backed by a local sentence-transformers model (e.g. all-MiniLM-L6-v2).
    No API cost; ~50ms per batch of 100 sentences on CPU.

    Requires: pip install sentence-transformers
    """

    def __init__(self, model_name: str | None = None) -> None:
        self._model_name = model_name or settings.SENTENCE_TRANSFORMER_MODEL
        self._model = None  # lazy — loaded on first call

    def _load(self):
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
                self._model = SentenceTransformer(self._model_name)
                logger.info("Loaded SentenceTransformer model: %s", self._model_name)
            except ImportError as exc:
                raise RuntimeError(
                    "sentence-transformers is not installed. "
                    "Run: pip install sentence-transformers\n"
                    "Or set SEMANTIC_EMBEDDER=openai in .env to use the OpenAI backend."
                ) from exc
        return self._model

    def _encode_sync(self, texts: list[str]) -> list[list[float]]:
        model = self._load()
        vectors = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
        return [v.tolist() for v in vectors]

    async def embed_text(self, text: str) -> list[float]:
        results = await self.embed_batch([text])
        return results[0]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._encode_sync, texts)


# ── Caching decorator (Decorator Pattern) ─────────────────────────────────────

class CachedEmbedder(EmbedderBase):
    """
    Transparent caching layer around any EmbedderBase.

    Cache-aside with batch deduplication:
      - Texts already in cache → returned immediately, no API call.
      - Missing texts → batched into a single call to the inner embedder.
      - Results written back to cache before returning.

    Injecting the cache as a dependency (DIP) makes both independently testable.
    """

    def __init__(self, inner: EmbedderBase, cache: EmbeddingCache) -> None:
        self._inner = inner
        self._cache = cache

    async def embed_text(self, text: str) -> list[float]:
        cached = self._cache.get(text)
        if cached is not None:
            return cached
        embedding = await self._inner.embed_text(text)
        self._cache.put(text, embedding)
        return embedding

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        # Deduplicate while preserving order
        seen: dict[str, int] = {}   # text → first occurrence index
        for i, t in enumerate(texts):
            if t not in seen:
                seen[t] = i

        unique_texts = list(seen.keys())
        results: dict[str, list[float]] = {}

        # Partition into cache hits and misses
        miss_texts: list[str] = []
        for t in unique_texts:
            hit = self._cache.get(t)
            if hit is not None:
                results[t] = hit
            else:
                miss_texts.append(t)

        # Single batch call for all misses
        if miss_texts:
            new_embs = await self._inner.embed_batch(miss_texts)
            for text, emb in zip(miss_texts, new_embs):
                self._cache.put(text, emb)
                results[text] = emb

        return [results[t] for t in texts]

    @property
    def cache_stats(self) -> dict:
        return self._cache.stats()


# ── Factory ───────────────────────────────────────────────────────────────────

class EmbedderFactory:
    """
    Creates and wires embedder instances.
    Open for extension: add a new branch per provider, no existing code changes.
    """

    @staticmethod
    def create(provider: str, cache_size: int = 10_000) -> CachedEmbedder:
        cache = EmbeddingCache(max_size=cache_size)

        if provider == "openai":
            inner: EmbedderBase = OpenAIEmbedder()
        elif provider == "sentence_transformer":
            inner = SentenceTransformerEmbedder()
        else:
            raise ValueError(
                f"Unknown SEMANTIC_EMBEDDER={provider!r}. "
                "Supported values: 'openai', 'sentence_transformer'."
            )

        logger.info("Semantic embedder: %s (cache_size=%d)", provider, cache_size)
        return CachedEmbedder(inner=inner, cache=cache)
