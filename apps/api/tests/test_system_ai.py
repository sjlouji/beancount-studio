"""The assistant's Ollama connection made in the app: status, connect, disconnect, and its effect."""

from __future__ import annotations

import json
from collections.abc import Iterator

import httpx
import pytest
from httpx import AsyncClient

from app.ai import connection

MODELS = [
    {
        "name": "mistral:latest",
        "size": 4_000_000_000,
        "modified_at": "2026-11-01T10:00:00Z",
        "details": {"family": "llama", "parameter_size": "7.2B"},
    },
    {
        "name": "nomic-embed-text:latest",
        "size": 270_000_000,
        "modified_at": "2026-10-01T10:00:00Z",
        "details": {"family": "nomic-bert", "parameter_size": "137M"},
    },
]
CAPABILITIES = {"mistral:latest": ["completion", "tools"], "nomic-embed-text:latest": ["embedding"]}


def _fake_ollama(request: httpx.Request) -> httpx.Response:
    """Answers like an Ollama server, at whichever usual address is probed."""
    if request.url.path == "/api/tags":
        return httpx.Response(200, json={"models": MODELS})
    if request.url.path == "/api/show":
        model = json.loads(request.content)["model"]
        return httpx.Response(200, json={"capabilities": CAPABILITIES.get(model, [])})
    return httpx.Response(404)


def _no_ollama(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("connection refused", request=request)


@pytest.fixture
def ollama() -> Iterator[None]:
    connection.transport = httpx.MockTransport(_fake_ollama)
    yield
    connection.transport = None


@pytest.fixture
def no_ollama() -> Iterator[None]:
    connection.transport = httpx.MockTransport(_no_ollama)
    yield
    connection.transport = None


@pytest.fixture(autouse=True)
async def _forget_connection(client: AsyncClient) -> None:
    """Every test starts without a stored connection (the database outlives a test)."""
    from app.db.base import get_session_factory

    async with get_session_factory()() as db:
        await connection.remove_ollama(db)


async def test_only_administrators_see_or_change_the_model(client: AsyncClient, user: dict) -> None:
    # The first account of a database is an administrator; make sure this one isn't.
    from app.db.base import get_session_factory
    from app.db.models import User

    async with get_session_factory()() as db:
        row = await db.get(User, user["id"])
        assert row is not None
        row.is_admin = False
        await db.commit()

    for method, url in (
        ("GET", "/api/system/ai"),
        ("PUT", "/api/system/ai/ollama"),
        ("DELETE", "/api/system/ai/ollama"),
    ):
        res = await client.request(
            method, url, json={"baseUrl": "http://localhost:11434", "model": "mistral:latest"}
        )
        assert res.status_code == 403, (method, url, res.text)


async def test_status_without_ollama_says_nothing_was_found(
    client: AsyncClient, admin: dict, no_ollama: None
) -> None:
    res = await client.get("/api/system/ai")
    assert res.status_code == 200, res.text
    assert res.json() == {
        "provider": None,
        "model": None,
        "connection": None,
        "detected": None,
        "environmentProvider": None,
    }


async def test_status_lists_the_detected_models_and_which_can_chat(
    client: AsyncClient, admin: dict, ollama: None
) -> None:
    res = await client.get("/api/system/ai")
    assert res.status_code == 200, res.text
    detected = res.json()["detected"]
    assert detected["baseUrl"] == "http://localhost:11434"
    can_chat = {m["name"]: m["canChat"] for m in detected["models"]}
    assert can_chat == {"mistral:latest": True, "nomic-embed-text:latest": False}


async def test_connecting_a_model_turns_the_assistant_on_and_disconnecting_turns_it_off(
    client: AsyncClient, admin: dict, ollama: None
) -> None:
    assert (await client.get("/api/system/info")).json()["aiEnabled"] is False

    res = await client.put(
        "/api/system/ai/ollama",
        json={"baseUrl": "http://localhost:11434/v1/", "model": "mistral:latest"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["connection"] == {"baseUrl": "http://localhost:11434", "model": "mistral:latest"}
    assert (body["provider"], body["model"]) == ("openai", "mistral:latest")

    info = (await client.get("/api/system/info")).json()
    assert (info["aiEnabled"], info["aiProvider"], info["aiModel"]) == (
        True,
        "openai",
        "mistral:latest",
    )

    res = await client.delete("/api/system/ai/ollama")
    assert res.status_code == 200, res.text
    assert res.json()["connection"] is None
    assert (await client.get("/api/system/info")).json()["aiEnabled"] is False


async def test_an_embedding_model_is_refused(
    client: AsyncClient, admin: dict, ollama: None
) -> None:
    res = await client.put(
        "/api/system/ai/ollama",
        json={"baseUrl": "http://localhost:11434", "model": "nomic-embed-text:latest"},
    )
    assert res.status_code == 422, res.text
    assert "doesn't call tools" in res.json()["error"]["message"]


async def test_a_model_that_is_not_pulled_is_refused(
    client: AsyncClient, admin: dict, ollama: None
) -> None:
    res = await client.put(
        "/api/system/ai/ollama", json={"baseUrl": "http://localhost:11434", "model": "qwen3:14b"}
    )
    assert res.status_code == 422, res.text
    assert "ollama pull qwen3:14b" in res.json()["error"]["message"]


async def test_connecting_to_a_server_that_does_not_answer_fails_loudly(
    client: AsyncClient, admin: dict, no_ollama: None
) -> None:
    res = await client.put(
        "/api/system/ai/ollama",
        json={"baseUrl": "http://localhost:11434", "model": "mistral:latest"},
    )
    assert res.status_code == 502, res.text
    assert res.json()["error"]["code"] == "ollama_unreachable"
