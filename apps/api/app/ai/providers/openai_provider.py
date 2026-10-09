"""OpenAI-compatible provider: Ollama, vLLM, LM Studio, llama.cpp, OpenRouter, Groq, ...

Uses the chat-completions API with function calling, which every compatible server speaks.
Reasoning deltas (`reasoning_content`, emitted by models such as Qwen3 / DeepSeek) are
forwarded to the UI when present.
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

import openai
from openai import AsyncOpenAI

from app.ai.messages import to_openai_messages
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

_FINISH_REASONS = {
    "stop": "end_turn",
    "tool_calls": "tool_use",
    "function_call": "tool_use",
    "length": "max_tokens",
    "content_filter": "refusal",
}


def _to_provider_error(exc: Exception) -> ProviderError:
    if isinstance(exc, openai.RateLimitError):
        return ProviderError(str(exc), kind="rate_limit", status=429)
    if isinstance(exc, openai.AuthenticationError):
        return ProviderError(str(exc), kind="auth", status=401)
    if isinstance(exc, openai.APIStatusError):
        return ProviderError(
            f"AI request failed ({exc.status_code}): {exc.message}",
            kind="api",
            status=exc.status_code,
        )
    if isinstance(exc, openai.APIConnectionError):
        return ProviderError(str(exc), kind="connection")
    return ProviderError(str(exc))


def _tools_to_openai(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t.get("input_schema") or {"type": "object", "properties": {}},
            },
        }
        for t in tools
    ]


def _parts_to_content(parts: list[ContentPart]) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = []
    for part in parts:
        kind = part.get("type")
        if kind == "text":
            content.append({"type": "text", "text": part["text"]})
        elif kind == "image":
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{part['media_type']};base64,{part['data']}"},
                }
            )
        elif kind == "pdf":
            raise ProviderError(
                "PDF input is not supported by OpenAI-compatible model servers here. Upload an image of the receipt instead.",
                kind="unsupported",
            )
    return content


def extract_json_object(text: str) -> dict[str, Any]:
    """Parse JSON from a model reply, tolerating code fences and surrounding prose."""
    stripped = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", stripped, re.S)
    if fence:
        stripped = fence.group(1)
    try:
        value = json.loads(stripped)
    except json.JSONDecodeError:
        start, end = stripped.find("{"), stripped.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ProviderError("The model returned malformed JSON.") from None
        try:
            value = json.loads(stripped[start : end + 1])
        except json.JSONDecodeError as exc:
            raise ProviderError("The model returned malformed JSON.") from exc
    if not isinstance(value, dict):
        raise ProviderError("The model returned JSON that is not an object.")
    return value


class _ToolCallAccumulator:
    def __init__(self) -> None:
        self.id: str | None = None
        self.name: str | None = None
        self.arguments = ""
        self.started = False


class OpenAICompatibleProvider(ChatProvider):
    name = "openai"

    def __init__(self, settings: Settings, client: AsyncOpenAI | None = None) -> None:
        super().__init__(settings)
        self.client = client or AsyncOpenAI(
            api_key=settings.openai_api_key or "not-needed",
            base_url=settings.openai_base_url or None,
            max_retries=2,
        )

    def convert_history(
        self, messages: list[dict[str, Any]], raw_turns: dict[str, Any] | None
    ) -> tuple[list[str], list[Any]]:
        return to_openai_messages(messages, unwrap_raw_turns(raw_turns, self.name))

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
        request: dict[str, Any] = {
            "model": model,
            "messages": [{"role": "system", "content": system}, *messages],
            "stream": True,
            "max_tokens": max_tokens,
        }
        if tools:
            request["tools"] = _tools_to_openai(tools)
        text_parts: list[str] = []
        reasoning_seen = False
        calls: dict[int, _ToolCallAccumulator] = {}
        finish_reason: str | None = None
        usage: dict[str, int] = {}
        try:
            stream = await self.client.chat.completions.create(**request)
            async for chunk in stream:
                chunk_usage = getattr(chunk, "usage", None)
                if chunk_usage is not None:
                    usage = {
                        "input_tokens": getattr(chunk_usage, "prompt_tokens", 0) or 0,
                        "output_tokens": getattr(chunk_usage, "completion_tokens", 0) or 0,
                    }
                if not chunk.choices:
                    continue
                choice = chunk.choices[0]
                delta = choice.delta
                if delta is None:
                    continue
                extra = getattr(delta, "model_extra", None) or {}
                reasoning = extra.get("reasoning_content") or extra.get("reasoning")
                if isinstance(reasoning, str) and reasoning:
                    reasoning_seen = True
                    events.on_reasoning(reasoning)
                if delta.content:
                    text_parts.append(delta.content)
                    events.on_text(delta.content)
                for tc in delta.tool_calls or []:
                    acc = calls.setdefault(tc.index, _ToolCallAccumulator())
                    if tc.id:
                        acc.id = acc.id or tc.id
                    fn = tc.function
                    if fn is not None:
                        if fn.name:
                            acc.name = (acc.name or "") + fn.name if not acc.started else acc.name
                        if fn.arguments:
                            acc.arguments += fn.arguments
                    if acc.name and not acc.started:
                        acc.id = acc.id or f"call_{uuid.uuid4().hex[:24]}"
                        acc.started = True
                        await events.on_tool_call_start(acc.id, acc.name)
                        if acc.arguments:
                            events.on_tool_call_delta(acc.id, acc.arguments)
                    elif acc.started and fn is not None and fn.arguments:
                        events.on_tool_call_delta(acc.id or "", fn.arguments)
                if choice.finish_reason:
                    finish_reason = choice.finish_reason
        except openai.OpenAIError as exc:
            log.error("openai-compatible request failed: %s", exc)
            raise _to_provider_error(exc) from exc

        tool_calls: list[ToolCall] = []
        raw_tool_calls: list[dict[str, Any]] = []
        for _index, acc in sorted(calls.items()):
            if not acc.name:
                continue
            call_id = acc.id or f"call_{uuid.uuid4().hex[:24]}"
            arguments = acc.arguments.strip() or "{}"
            input_error: str | None = None
            try:
                parsed = json.loads(arguments)
                if not isinstance(parsed, dict):
                    parsed, input_error = {}, "tool arguments must be a JSON object"
            except json.JSONDecodeError as exc:
                parsed, input_error = {}, f"tool arguments are not valid JSON: {exc}"
            tool_calls.append(
                ToolCall(id=call_id, name=acc.name, input=parsed, input_error=input_error)
            )
            raw_tool_calls.append(
                {
                    "id": call_id,
                    "type": "function",
                    "function": {"name": acc.name, "arguments": arguments},
                }
            )
        text = "".join(text_parts)
        raw_assistant: dict[str, Any] = {"role": "assistant", "content": text or None}
        if raw_tool_calls:
            raw_assistant["tool_calls"] = raw_tool_calls
        stop_reason = (
            "tool_use" if tool_calls else _FINISH_REASONS.get(finish_reason or "stop", "end_turn")
        )
        if reasoning_seen and not text and not tool_calls:
            stop_reason = "end_turn"
        return TurnResult(
            text=text,
            tool_calls=tool_calls,
            stop_reason=stop_reason,  # type: ignore[arg-type]
            raw_assistant=raw_assistant,
            usage=usage,
        )

    def tool_result_messages(self, results: list[ToolResult]) -> list[Any]:
        return [
            {
                "role": "tool",
                "tool_call_id": r.tool_call_id,
                "content": json.dumps(r.result, ensure_ascii=False, default=str),
            }
            for r in results
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
        content = _parts_to_content(parts)
        base: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": content},
            ],
            "max_tokens": max_tokens,
            "temperature": 0,
        }
        try:
            try:
                response = await self.client.chat.completions.create(
                    **base,
                    response_format={
                        "type": "json_schema",
                        "json_schema": {"name": "result", "schema": schema, "strict": True},
                    },
                )
            except openai.BadRequestError:
                # Servers without json_schema support: fall back to JSON mode + the schema in the prompt.
                log.info(
                    "json_schema response_format rejected by %s; retrying in json_object mode",
                    model,
                )
                fallback = dict(base)
                fallback["messages"] = [
                    {
                        "role": "system",
                        "content": system
                        + "\n\nRespond with a single JSON object that matches this JSON Schema exactly:\n"
                        + json.dumps(schema),
                    },
                    {"role": "user", "content": content},
                ]
                response = await self.client.chat.completions.create(
                    **fallback, response_format={"type": "json_object"}
                )
        except openai.OpenAIError as exc:
            log.error("openai-compatible structured request failed: %s", exc)
            raise _to_provider_error(exc) from exc
        if not response.choices:
            raise ProviderError("The model returned no choices.")
        message = response.choices[0].message
        if getattr(message, "refusal", None):
            raise ProviderError("The model declined this request.")
        return extract_json_object(message.content or "")
