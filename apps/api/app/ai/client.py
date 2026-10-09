"""Anthropic client factory. The assistant is disabled when no API key is configured."""

from __future__ import annotations

from anthropic import AsyncAnthropic

from app.config import Settings
from app.errors import FeatureDisabledError

_client: AsyncAnthropic | None = None


def get_client(settings: Settings) -> AsyncAnthropic:
    global _client
    if not settings.ai_enabled:
        raise FeatureDisabledError(
            "The AI assistant is not configured. Set BS_ANTHROPIC_API_KEY on the server."
        )
    if _client is None:
        _client = AsyncAnthropic(
            api_key=settings.anthropic_api_key,
            base_url=settings.anthropic_base_url or None,
            max_retries=2,
        )
    return _client
