"""Model providers for the assistant. `get_provider` resolves the configured one."""

from __future__ import annotations

from app.ai.providers.base import (
    AI_DISABLED_MESSAGE,
    ChatProvider,
    ContentPart,
    ProviderError,
    StreamEvents,
    ToolCall,
    ToolResult,
    TurnResult,
    wrap_raw_turn,
)
from app.config import Settings
from app.errors import FeatureDisabledError

_cache: dict[tuple[str, str, str, str], ChatProvider] = {}


def get_provider(settings: Settings) -> ChatProvider:
    resolved = settings.resolved_ai_provider
    if resolved is None:
        raise FeatureDisabledError(AI_DISABLED_MESSAGE)
    key = (resolved, settings.anthropic_api_key, settings.openai_base_url, settings.openai_api_key)
    provider = _cache.get(key)
    if provider is None:
        if resolved == "anthropic":
            from app.ai.providers.anthropic_provider import AnthropicProvider

            provider = AnthropicProvider(settings)
        else:
            from app.ai.providers.openai_provider import OpenAICompatibleProvider

            provider = OpenAICompatibleProvider(settings)
        _cache[key] = provider
    return provider


__all__ = [
    "AI_DISABLED_MESSAGE",
    "ChatProvider",
    "ContentPart",
    "ProviderError",
    "StreamEvents",
    "ToolCall",
    "ToolResult",
    "TurnResult",
    "get_provider",
    "wrap_raw_turn",
]
