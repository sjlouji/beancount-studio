"""OpenAI-compatible provider: message conversion, streamed tool calls, JSON fallback, config."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import openai
import pytest

from app.ai.messages import to_openai_messages
from app.ai.providers.base import ProviderError, unwrap_raw_turns, wrap_raw_turn
from app.ai.providers.openai_provider import OpenAICompatibleProvider, extract_json_object
from app.config import Settings


def _settings(**overrides: Any) -> Settings:
    base = {
        "data_dir": "/tmp/bs-provider-test",
        "openai_base_url": "http://ollama:11434/v1",
        "ai_model": "qwen3:14b",
    }
    return Settings(**{**base, **overrides})


class _Events:
    def __init__(self) -> None:
        self.text: list[str] = []
        self.reasoning: list[str] = []
        self.starts: list[tuple[str, str]] = []
        self.deltas: list[tuple[str, str]] = []

    def on_text(self, delta: str) -> None:
        self.text.append(delta)

    def on_reasoning(self, delta: str) -> None:
        self.reasoning.append(delta)

    async def on_tool_call_start(self, tool_call_id: str, name: str) -> None:
        self.starts.append((tool_call_id, name))

    def on_tool_call_delta(self, tool_call_id: str, partial_json: str) -> None:
        self.deltas.append((tool_call_id, partial_json))


def _chunk(
    *,
    content: str | None = None,
    tool_calls: list[dict[str, Any]] | None = None,
    finish: str | None = None,
    reasoning: str | None = None,
):
    delta = SimpleNamespace(
        content=content,
        tool_calls=None,
        model_extra={"reasoning_content": reasoning} if reasoning else {},
    )
    if tool_calls:
        delta.tool_calls = [
            SimpleNamespace(
                index=tc["index"],
                id=tc.get("id"),
                function=SimpleNamespace(name=tc.get("name"), arguments=tc.get("arguments")),
            )
            for tc in tool_calls
        ]
    return SimpleNamespace(choices=[SimpleNamespace(delta=delta, finish_reason=finish)], usage=None)


class _FakeCompletions:
    def __init__(
        self, chunks: list[Any], *, json_schema_supported: bool = True, json_reply: str = "{}"
    ) -> None:
        self.chunks = chunks
        self.json_schema_supported = json_schema_supported
        self.json_reply = json_reply
        self.requests: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any):
        self.requests.append(kwargs)
        if kwargs.get("stream"):

            async def gen():
                for c in self.chunks:
                    yield c

            return gen()
        fmt = kwargs.get("response_format", {})
        if fmt.get("type") == "json_schema" and not self.json_schema_supported:
            raise openai.BadRequestError(
                "response_format json_schema not supported",
                response=SimpleNamespace(status_code=400, headers={}, request=None),
                body=None,
            )
        return SimpleNamespace(
            choices=[
                SimpleNamespace(message=SimpleNamespace(content=self.json_reply, refusal=None))
            ]
        )


def _provider(completions: _FakeCompletions) -> OpenAICompatibleProvider:
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    return OpenAICompatibleProvider(_settings(), client=client)  # type: ignore[arg-type]


def test_settings_resolve_openai_provider_only_with_base_url_and_model():
    assert _settings().resolved_ai_provider == "openai"
    assert _settings().resolved_ai_model == "qwen3:14b"
    assert _settings(ai_model="").resolved_ai_provider is None
    assert _settings(anthropic_api_key="k").resolved_ai_provider == "anthropic"
    assert _settings(anthropic_api_key="k", ai_provider="openai").resolved_ai_provider == "openai"
    assert _settings(ai_provider="disabled").ai_enabled is False
    assert _settings(anthropic_api_key="k", ai_model="").resolved_ai_model == "claude-opus-5-5"


def test_data_dir_is_resolved_to_an_absolute_path():
    assert _settings(data_dir="./relative-data").data_dir.is_absolute()


def test_to_openai_messages_roundtrip_and_replay():
    files = [{"operation": "append", "path": "main.bean", "content": "x"}]
    messages = [
        {"role": "system", "content": "extra"},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Add coffee"},
                {
                    "type": "file",
                    "data": "data:image/png;base64,aGVsbG8=",
                    "mediaType": "image/png",
                },
            ],
        },
        {
            "role": "assistant",
            "content": [
                {"type": "text", "text": "Sure"},
                {
                    "type": "tool-call",
                    "toolCallId": "call_1",
                    "toolName": "request_approval",
                    "input": {"description": "d", "files": files},
                },
            ],
        },
        {
            "role": "tool",
            "content": [
                {
                    "type": "tool-result",
                    "toolCallId": "call_1",
                    "toolName": "request_approval",
                    "output": {"type": "json", "value": {"approved": True}},
                }
            ],
        },
    ]
    systems, out = to_openai_messages(messages)
    assert systems == ["extra"]
    assert [m["role"] for m in out] == ["user", "assistant", "tool"]
    assert out[0]["content"][1]["type"] == "image_url"
    assert out[1]["tool_calls"][0]["function"]["name"] == "request_approval"
    assert json.loads(out[1]["tool_calls"][0]["function"]["arguments"])["files"] == files
    assert out[2] == {"role": "tool", "tool_call_id": "call_1", "content": '{"approved": true}'}

    raw = wrap_raw_turn(
        "openai",
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {"name": "request_approval", "arguments": "{}"},
                }
            ],
        },
    )
    _, replayed = to_openai_messages(messages, unwrap_raw_turns({"call_1": raw}, "openai"))
    assert replayed[1] == raw["message"]
    # Turns stored by another provider are not replayed.
    assert unwrap_raw_turns({"call_1": raw}, "anthropic") == {}


async def test_stream_turn_accumulates_tool_call_deltas():
    chunks = [
        _chunk(reasoning="thinking…"),
        _chunk(content="Let me "),
        _chunk(content="look."),
        _chunk(
            tool_calls=[{"index": 0, "id": "call_abc", "name": "run_bql_query", "arguments": ""}]
        ),
        _chunk(tool_calls=[{"index": 0, "arguments": '{"query": "SELECT '}]),
        _chunk(tool_calls=[{"index": 0, "arguments": 'account"}'}], finish="tool_calls"),
    ]
    completions = _FakeCompletions(chunks)
    events = _Events()
    turn = await _provider(completions).stream_turn(
        model="qwen3:14b",
        system="sys",
        messages=[{"role": "user", "content": "hi"}],
        tools=[
            {
                "name": "run_bql_query",
                "description": "q",
                "input_schema": {"type": "object", "properties": {}},
            }
        ],
        events=events,
    )
    assert turn.text == "Let me look."
    assert turn.stop_reason == "tool_use"
    assert turn.tool_calls[0].name == "run_bql_query" and turn.tool_calls[0].input == {
        "query": "SELECT account"
    }
    assert events.reasoning == ["thinking…"]
    assert events.starts == [("call_abc", "run_bql_query")]
    assert "".join(d for _, d in events.deltas) == '{"query": "SELECT account"}'
    assert turn.raw_assistant["tool_calls"][0]["id"] == "call_abc"
    request = completions.requests[0]
    assert request["messages"][0] == {"role": "system", "content": "sys"}
    assert request["tools"][0]["function"]["name"] == "run_bql_query"


async def test_stream_turn_handles_missing_ids_and_bad_json():
    chunks = [
        _chunk(
            tool_calls=[{"index": 0, "name": "get_report", "arguments": "{not json"}], finish="stop"
        )
    ]
    turn = await _provider(_FakeCompletions(chunks)).stream_turn(
        model="m",
        system="s",
        messages=[{"role": "user", "content": "x"}],
        tools=[],
        events=_Events(),
    )
    assert turn.stop_reason == "tool_use"
    call = turn.tool_calls[0]
    assert call.id.startswith("call_") and call.input == {} and call.input_error


async def test_generate_json_falls_back_to_json_object_mode():
    completions = _FakeCompletions(
        [],
        json_schema_supported=False,
        json_reply='```json\n{"suggestions": [{"id": 1, "account": "Expenses:Food", "confidence": 0.9, "reasoning": "x"}]}\n```',
    )
    data = await _provider(completions).generate_json(
        model="m", system="s", parts=[{"type": "text", "text": "rows"}], schema={"type": "object"}
    )
    assert data["suggestions"][0]["account"] == "Expenses:Food"
    assert completions.requests[0]["response_format"]["type"] == "json_schema"
    assert completions.requests[1]["response_format"] == {"type": "json_object"}
    assert "JSON Schema" in completions.requests[1]["messages"][0]["content"]


async def test_generate_json_rejects_pdf_parts():
    with pytest.raises(ProviderError) as excinfo:
        await _provider(_FakeCompletions([])).generate_json(
            model="m",
            system="s",
            parts=[{"type": "pdf", "data": "AA==", "filename": "r.pdf"}],
            schema={},
        )
    assert excinfo.value.kind == "unsupported"


def test_extract_json_object_tolerates_prose():
    assert extract_json_object('Here you go: {"a": 1} thanks') == {"a": 1}
    with pytest.raises(ProviderError):
        extract_json_object("no json here")
