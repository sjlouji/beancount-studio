"""Anthropic provider (official SDK)."""

from __future__ import annotations

import json
from typing import Any

import anthropic
from anthropic import AsyncAnthropic

from app.ai.messages import to_anthropic_messages
from app.ai.providers.base import (
    ChatProvider,
    ContentPart,
    ProviderError,
    StreamEvents,
    ToolCall,
    ToolResult,
    TurnResult,
    unwrap_raw_turns,
)
from app.config import Settings
from app.logging_setup import get_logger

log = get_logger(__name__)

_STOP_REASONS = {
    "end_turn": "end_turn",
    "stop_sequence": "end_turn",
    "pause_turn": "end_turn",
    "tool_use": "tool_use",
    "max_tokens": "max_tokens",
    "refusal": "refusal",
}


def _to_provider_error(exc: Exception) -> ProviderError:
    if isinstance(exc, anthropic.RateLimitError):
        return ProviderError(str(exc), kind="rate_limit", status=429)
    if isinstance(exc, anthropic.AuthenticationError):
        return ProviderError(str(exc), kind="auth", status=401)
    if isinstance(exc, anthropic.APIStatusError):
        return ProviderError(
            f"AI request failed ({exc.status_code}): {exc.message}",
            kind="api",
            status=exc.status_code,
        )
    if isinstance(exc, anthropic.APIConnectionError):
        return ProviderError(str(exc), kind="connection")
    return ProviderError(str(exc))


def _parts_to_blocks(parts: list[ContentPart]) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for part in parts:
        kind = part.get("type")
        if kind == "text":
            blocks.append({"type": "text", "text": part["text"]})
        elif kind == "image":
            blocks.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": part["media_type"],
                        "data": part["data"],
                    },
                }
            )
        elif kind == "pdf":
            blocks.append(
                {
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": part["data"],
                    },
                    "title": part.get("filename") or "document.pdf",
                }
            )
    return blocks


class AnthropicProvider(ChatProvider):
    name = "anthropic"

    def __init__(self, settings: Settings, client: AsyncAnthropic | None = None) -> None:
        super().__init__(settings)
        self.client = client or AsyncAnthropic(
            api_key=settings.anthropic_api_key,
            base_url=settings.anthropic_base_url or None,
            max_retries=2,
        )

    def convert_history(
        self, messages: list[dict[str, Any]], raw_turns: dict[str, Any] | None
    ) -> tuple[list[str], list[Any]]:
        native = unwrap_raw_turns(raw_turns, self.name)
        blocks_by_id = {k: v.get("content") for k, v in native.items() if isinstance(v, dict)}
        return to_anthropic_messages(messages, blocks_by_id)

    async def stream_turn(
        self,
        *,
        model: str,
        system: str,
        messages: list[Any],
        tools: list[dict[str, Any]],
        events: StreamEvents,
        max_tokens: int = 16000,
    ) -> TurnResult:
        system_blocks = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
        try:
            async with self.client.beta.messages.stream(
                model=model,
                max_tokens=max_tokens,
                system=system_blocks,
                messages=messages,
                tools=tools,
                output_config={"effort": "medium"},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            ) as stream:
                block_ids: dict[int, str] = {}
                async for event in stream:
                    if event.type == "content_block_start":
                        block = event.content_block
                        if block.type == "tool_use":
                            block_ids[event.index] = block.id
                            await events.on_tool_call_start(block.id, block.name)
                    elif event.type == "content_block_delta":
                        delta = event.delta
                        if delta.type == "text_delta":
                            events.on_text(delta.text)
                        elif delta.type == "thinking_delta" and delta.thinking:
                            events.on_reasoning(delta.thinking)
                        elif delta.type == "input_json_delta":
                            tool_call_id = block_ids.get(event.index)
                            if tool_call_id:
                                events.on_tool_call_delta(tool_call_id, delta.partial_json)
                final = await stream.get_final_message()
        except anthropic.AnthropicError as exc:
            log.error("anthropic request failed: %s", exc)
            raise _to_provider_error(exc) from exc

        raw_blocks = [b.model_dump(mode="json", exclude_none=True) for b in final.content]
        text = "".join(b.text for b in final.content if b.type == "text" and b.text)
        tool_calls = [
            ToolCall(id=b.id, name=b.name, input=b.input if isinstance(b.input, dict) else {})
            for b in final.content
            if b.type == "tool_use"
        ]
        usage = {
            "input_tokens": getattr(final.usage, "input_tokens", 0) or 0,
            "output_tokens": getattr(final.usage, "output_tokens", 0) or 0,
        }
        return TurnResult(
            text=text,
            tool_calls=tool_calls,
            stop_reason=_STOP_REASONS.get(final.stop_reason or "end_turn", "end_turn"),  # type: ignore[arg-type]
            raw_assistant={"role": "assistant", "content": raw_blocks},
            usage=usage,
        )

    def tool_result_messages(self, results: list[ToolResult]) -> list[Any]:
        if not results:
            return []
        return [
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": r.tool_call_id,
                        "content": json.dumps(r.result, ensure_ascii=False, default=str),
                        "is_error": r.is_error,
                    }
                    for r in results
                ],
            }
        ]

    async def generate_json(
        self,
        *,
        model: str,
        system: str,
        parts: list[ContentPart],
        schema: dict[str, Any],
        max_tokens: int = 16000,
    ) -> dict[str, Any]:
        try:
            response = await self.client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": _parts_to_blocks(parts)}],
                output_config={
                    "effort": "low",
                    "format": {"type": "json_schema", "schema": schema},
                },
            )
        except anthropic.AnthropicError as exc:
            log.error("anthropic structured request failed: %s", exc)
            raise _to_provider_error(exc) from exc
        if response.stop_reason == "refusal":
            raise ProviderError("The model declined this request.", kind="api")
        text = next((b.text for b in response.content if b.type == "text"), "{}")
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise ProviderError("The model returned malformed JSON.") from exc
