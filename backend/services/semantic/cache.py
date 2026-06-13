"""
Thread-safe LRU embedding cache.

Single responsibility: store and retrieve text embeddings by content hash.
Decoupled from any specific embedder — injected into CachedEmbedder as a
dependency so both can be tested and swapped independently.
"""

import hashlib
import threading
from collections import OrderedDict


class EmbeddingCache:
    """
    In-memory LRU cache mapping text content → embedding vector.

    Keys are SHA-256 hashes of the (lowercased, stripped) input text so that
    minor formatting differences don't produce cache misses for identical content.
    Thread-safe via a single lock; appropriate for FastAPI's async + thread-pool model.
    """

    def __init__(self, max_size: int = 10_000) -> None:
        self._store: OrderedDict[str, list[float]] = OrderedDict()
        self._max_size = max_size
        self._lock = threading.Lock()
        self._hits = 0
        self._misses = 0

    # ── Public API ────────────────────────────────────────────────────────────

    def get(self, text: str) -> list[float] | None:
        key = self._key(text)
        with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
                self._hits += 1
                return self._store[key]
            self._misses += 1
            return None

    def put(self, text: str, embedding: list[float]) -> None:
        key = self._key(text)
        with self._lock:
            if key in self._store:
                self._store.move_to_end(key)
            self._store[key] = embedding
            if len(self._store) > self._max_size:
                self._store.popitem(last=False)  # evict LRU entry

    def stats(self) -> dict:
        with self._lock:
            total = self._hits + self._misses
            return {
                "size": len(self._store),
                "max_size": self._max_size,
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate": round(self._hits / total, 3) if total else 0.0,
            }

    def clear(self) -> None:
        with self._lock:
            self._store.clear()
            self._hits = 0
            self._misses = 0

    # ── Internal ──────────────────────────────────────────────────────────────

    @staticmethod
    def _key(text: str) -> str:
        normalised = text.lower().strip()
        return hashlib.sha256(normalised.encode()).hexdigest()
