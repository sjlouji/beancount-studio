from __future__ import annotations

import os
import tempfile
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

_tmp = tempfile.mkdtemp(prefix="bs-test-")
os.environ["BS_DATA_DIR"] = _tmp
os.environ["BS_LOG_LEVEL"] = "WARNING"
os.environ["BS_ANTHROPIC_API_KEY"] = ""

from app.config import get_settings  # noqa: E402
from app.db.base import dispose_db, init_db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _settings():
    get_settings.cache_clear()
    return get_settings()


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await dispose_db()


@pytest.fixture
async def user(client: AsyncClient) -> dict:
    import uuid

    name = f"u{uuid.uuid4().hex[:8]}"
    res = await client.post(
        "/api/auth/sign-up",
        json={
            "email": f"{name}@example.com",
            "username": name,
            "password": "correct-horse-battery",
            "createExampleLedger": False,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


@pytest.fixture
async def ledger(client: AsyncClient, user: dict) -> dict:
    res = await client.post(
        "/api/ledgers", json={"title": "Test Books", "template": "example", "currency": "USD"}
    )
    assert res.status_code == 201, res.text
    return res.json()
