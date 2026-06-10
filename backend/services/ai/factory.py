from functools import lru_cache

from config import settings
from services.ai.base import AIStrategy


@lru_cache(maxsize=4)
def get_ai_strategy(provider: str | None = None) -> AIStrategy:
    """
    Return a cached AIStrategy for the given provider name.
    Falls back to settings.AI_PROVIDER when provider is None.

    Supported values: "openai" | "claude"
    """
    p = (provider or settings.AI_PROVIDER).lower()
    if p == "openai":
        from services.ai.openai_strategy import OpenAIStrategy
        return OpenAIStrategy()
    if p == "claude":
        from services.ai.claude_strategy import ClaudeStrategy
        return ClaudeStrategy()
    raise ValueError(f"Unknown AI provider {p!r}. Supported: 'openai', 'claude'.")
