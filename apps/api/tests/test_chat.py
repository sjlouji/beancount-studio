"""Chat endpoint: a fake Anthropic stream drives the agent loop end to end."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest
from httpx import AsyncClient

from app.ai import agent as agent_module
from app.config import get_settings


class _Block(SimpleNamespace):
    def model_dump(self, **_: Any) -> dict[str, Any]:
        return {k: v for k, v in self.__dict__.items() if v is not None}


class _FakeStream:
    """Emits one text delta, then (optionally) one tool_use block, then a final message."""

    def __init__(self, turn: dict[str, Any]) -> None:
        self.turn = turn

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def __aiter__(self):
        async def gen():
            yield SimpleNamespace(
                type="content_block_delta",
                index=0,
                delta=SimpleNamespace(type="text_delta", text=self.turn["text"]),
            )
            if self.turn.get("tool"):
                tool = self.turn["tool"]
                yield SimpleNamespace(
                    type="content_block_start",
                    index=1,
                    content_block=SimpleNamespace(
                        type="tool_use", name=tool["name"], id=tool["id"]
                    ),
                )
                yield SimpleNamespace(
                    type="content_block_delta",
                    index=1,
                    delta=SimpleNamespace(
                        type="input_json_delta", partial_json=json.dumps(tool["input"])
                    ),
                )

        return gen()

    async def get_final_message(self):
        content = [_Block(type="text", text=self.turn["text"])]
        if self.turn.get("tool"):
            tool = self.turn["tool"]
            content.append(
                _Block(type="tool_use", id=tool["id"], name=tool["name"], input=tool["input"])
            )
        return SimpleNamespace(
            content=content, stop_reason="tool_use" if self.turn.get("tool") else "end_turn"
        )


class _FakeClient:
    def __init__(self, turns: list[dict[str, Any]]) -> None:
        self.turns = list(turns)
        self.requests: list[dict[str, Any]] = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(stream=self._stream))

    def _stream(self, **kwargs: Any) -> _FakeStream:
        self.requests.append(kwargs)
        return _FakeStream(self.turns.pop(0))


@pytest.fixture
def fake_ai(monkeypatch: pytest.MonkeyPatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    holder: dict[str, _FakeClient] = {}

    def make(turns: list[dict[str, Any]]) -> _FakeClient:
        client = _FakeClient(turns)
        holder["client"] = client
        monkeypatch.setattr(agent_module, "get_client", lambda _settings: client)
        return client

    yield make
    monkeypatch.setattr(settings, "anthropic_api_key", "")


async def test_chat_streams_text_and_runs_backend_tool(
    client: AsyncClient, user: dict, ledger: dict, fake_ai
):
    owner, slug = ledger["owner"], ledger["slug"]
    base = f"/api/ledgers/{owner}/{slug}/chat"
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
    owner, slug = ledger["owner"], ledger["slug"]
    base = f"/api/ledgers/{owner}/{slug}/chat"
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
    journal = await client.get(
        f"/api/ledgers/{owner}/{slug}/journal", params={"search": "Test Cafe"}
    )
    assert journal.json()["total"] == 1
    commits = await client.get(f"/api/ledgers/{owner}/{slug}/commits")
    assert commits.json()["commits"][0]["subject"] == "Add espresso"


async def test_chat_disabled_without_key(client: AsyncClient, user: dict, ledger: dict):
    res = await client.post(
        f"/api/ledgers/{ledger['owner']}/{ledger['slug']}/chat",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert res.status_code == 503
