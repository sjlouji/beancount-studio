"""Chat endpoint: a scripted fake provider drives the agent loop end to end."""

from __future__ import annotations

from typing import Any

import pytest
from httpx import AsyncClient

from app.ai import agent as agent_module
from app.ai.messages import to_anthropic_messages
from app.ai.providers.base import (
    ChatProvider,
    StreamEvents,
    ToolCall,
    ToolResult,
    TurnResult,
    unwrap_raw_turns,
)
from app.config import get_settings


class FakeProvider(ChatProvider):
    """Plays back scripted turns: each is {"text": str, "tool": {id, name, input} | None}."""

    name = "fake"

    def __init__(self, turns: list[dict[str, Any]]) -> None:
        self.turns = list(turns)
        self.requests: list[dict[str, Any]] = []

    def convert_history(self, messages, raw_turns):
        native = unwrap_raw_turns(raw_turns, self.name)
        blocks = {k: v.get("content") for k, v in native.items() if isinstance(v, dict)}
        return to_anthropic_messages(messages, blocks)

    async def stream_turn(
        self, *, model, system, messages, tools, events: StreamEvents, max_tokens=16000
    ):
        self.requests.append({"model": model, "messages": list(messages), "tools": tools})
        turn = self.turns.pop(0)
        events.on_text(turn["text"])
        blocks: list[dict[str, Any]] = [{"type": "text", "text": turn["text"]}]
        calls: list[ToolCall] = []
        if turn.get("tool"):
            tool = turn["tool"]
            await events.on_tool_call_start(tool["id"], tool["name"])
            events.on_tool_call_delta(tool["id"], "{}")
            calls.append(ToolCall(id=tool["id"], name=tool["name"], input=tool["input"]))
            blocks.append(
                {"type": "tool_use", "id": tool["id"], "name": tool["name"], "input": tool["input"]}
            )
        return TurnResult(
            text=turn["text"],
            tool_calls=calls,
            stop_reason="tool_use" if calls else "end_turn",
            raw_assistant={"role": "assistant", "content": blocks},
        )

    def tool_result_messages(self, results: list[ToolResult]):
        return [
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": r.tool_call_id,
                        "content": str(r.result),
                        "is_error": r.is_error,
                    }
                    for r in results
                ],
            }
        ]

    async def generate_json(self, *, model, system, parts, schema, max_tokens=16000):
        raise NotImplementedError


@pytest.fixture
def fake_ai(monkeypatch: pytest.MonkeyPatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    assert settings.ai_enabled

    def make(turns: list[dict[str, Any]]) -> FakeProvider:
        provider = FakeProvider(turns)
        monkeypatch.setattr(agent_module, "get_provider", lambda _settings: provider)
        return provider

    yield make
    monkeypatch.setattr(settings, "anthropic_api_key", "")


async def test_chat_streams_text_and_runs_backend_tool(
    client: AsyncClient, user: dict, ledger: dict, fake_ai
):
    ledger_base = f"/api/workspaces/{ledger['workspace']}/ledgers/{ledger['slug']}"
    base = f"{ledger_base}/chat"
    thread = (await client.post(f"{base}/threads")).json()
    ai = fake_ai(
        [
            {
                "text": "Let me check.",
                "tool": {
                    "id": "toolu_1",
                    "name": "run_bql_query",
                    "input": {
                        "query": "SELECT account, sum(position) WHERE account ~ 'Food' GROUP BY account LIMIT 2"
                    },
                },
            },
            {"text": "You spent on food."},
        ]
    )
    res = await client.post(
        base,
        json={
            "threadId": thread["id"],
            "messages": [
                {"role": "user", "content": [{"type": "text", "text": "How much on food?"}]}
            ],
            "tools": {},
        },
    )
    assert res.status_code == 200, res.text
    assert res.headers["x-vercel-ai-data-stream"] == "v1"
    assert res.headers["cache-control"] == "no-cache, no-transform"
    body = res.text
    assert '0:"Let me check."' in body
    assert 'b:{"toolCallId": "toolu_1", "toolName": "run_bql_query"}' in body
    assert "a:{" in body and '"toolCallId": "toolu_1"' in body
    assert '0:"You spent on food."' in body
    # The second request carried the tool result back to the model.
    second = ai.requests[1]["messages"]
    assert second[-1]["role"] == "user" and second[-1]["content"][0]["type"] == "tool_result"

    stored = (await client.get(f"{base}/threads/{thread['id']}")).json()
    assert [m["role"] for m in stored["messages"]] == ["user", "assistant"]
    assistant = stored["messages"][1]["content"]
    assert assistant[0] == {"type": "text", "text": "Let me check."}
    assert assistant[1]["type"] == "tool-call" and assistant[1]["result"]["rowCount"] >= 1
    assert stored["title"] == "How much on food?"


async def test_edit_requires_approval_then_commits(
    client: AsyncClient, user: dict, ledger: dict, fake_ai
):
    ledger_base = f"/api/workspaces/{ledger['workspace']}/ledgers/{ledger['slug']}"
    base = f"{ledger_base}/chat"
    files = [
        {
            "operation": "append",
            "path": "main.bean",
            "content": '2025-12-20 * "Test Cafe" "Espresso"\n  Expenses:Food:Coffee  3.00 USD\n  Assets:US:BofA:Checking\n',
        }
    ]
    # Turn 1: the model tries to edit without approval -> error result -> it asks for approval (frontend tool).
    fake_ai(
        [
            {
                "text": "Adding it.",
                "tool": {
                    "id": "t_edit",
                    "name": "edit_ledger_files",
                    "input": {"description": "Add espresso", "files": files},
                },
            },
            {
                "text": "Please approve.",
                "tool": {
                    "id": "t_approve",
                    "name": "request_approval",
                    "input": {"description": "Add espresso", "files": files},
                },
            },
        ]
    )
    tools = {
        "request_approval": {
            "description": "approve",
            "parameters": {"type": "object", "properties": {}},
        }
    }
    res = await client.post(
        base,
        json={
            "messages": [
                {"role": "user", "content": [{"type": "text", "text": "Add an espresso"}]}
            ],
            "tools": tools,
        },
    )
    assert res.status_code == 200
    assert "approval_required" in res.text
    assert 'b:{"toolCallId": "t_approve", "toolName": "request_approval"}' in res.text

    # Turn 2: the user approved; the model calls edit_ledger_files again and it commits.
    ai = fake_ai(
        [
            {
                "text": "Committing.",
                "tool": {
                    "id": "t_edit2",
                    "name": "edit_ledger_files",
                    "input": {"description": "Add espresso", "files": files},
                },
            },
            {"text": "Done."},
        ]
    )
    history = [
        {"role": "user", "content": [{"type": "text", "text": "Add an espresso"}]},
        {
            "role": "assistant",
            "content": [
                {
                    "type": "tool-call",
                    "toolCallId": "t_approve",
                    "toolName": "request_approval",
                    "input": {"description": "Add espresso", "files": files},
                }
            ],
        },
        {
            "role": "tool",
            "content": [
                {
                    "type": "tool-result",
                    "toolCallId": "t_approve",
                    "toolName": "request_approval",
                    "output": {"type": "json", "value": {"approved": True}},
                }
            ],
        },
    ]
    res = await client.post(base, json={"messages": history, "tools": tools})
    assert res.status_code == 200, res.text
    assert '"committed": true' in res.text
    assert len(ai.requests) == 2
    journal = await client.get(f"{ledger_base}/journal", params={"search": "Test Cafe"})
    assert journal.json()["total"] == 1
    commits = await client.get(f"{ledger_base}/commits")
    assert commits.json()["commits"][0]["subject"] == "Add espresso"


async def test_chat_disabled_without_provider(client: AsyncClient, user: dict, ledger: dict):
    res = await client.post(
        f"/api/workspaces/{ledger['workspace']}/ledgers/{ledger['slug']}/chat",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert res.status_code == 503
    assert "BS_OPENAI_BASE_URL" in res.json()["error"]["message"]
