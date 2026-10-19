from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from httpx import AsyncClient

from app.db.base import get_session_factory
from app.db.models import DesktopSignIn, utcnow


def _pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(32)
    return verifier, hashlib.sha256(verifier.encode("utf-8")).hexdigest()


async def test_exchange_is_pending_until_the_browser_approves(client: AsyncClient):
    verifier, _ = _pair()
    res = await client.post("/api/auth/desktop/exchange", json={"verifier": verifier})
    assert res.status_code == 202
    assert res.json() == {"status": "pending"}


async def test_approve_requires_a_signed_in_browser(client: AsyncClient):
    _, challenge = _pair()
    res = await client.post("/api/auth/desktop/approve", json={"challenge": challenge})
    assert res.status_code == 401


async def test_approve_rejects_a_malformed_challenge(client: AsyncClient, user: dict):
    res = await client.post("/api/auth/desktop/approve", json={"challenge": "not-a-hash"})
    assert res.status_code == 422


async def test_browser_approval_hands_a_session_to_the_app(client: AsyncClient, user: dict):
    verifier, challenge = _pair()
    approved = await client.post("/api/auth/desktop/approve", json={"challenge": challenge})
    assert approved.status_code == 204

    client.cookies.clear()  # the desktop app has no browser cookies
    wrong = await client.post(
        "/api/auth/desktop/exchange", json={"verifier": secrets.token_urlsafe(32)}
    )
    assert wrong.status_code == 202

    res = await client.post("/api/auth/desktop/exchange", json={"verifier": verifier})
    assert res.status_code == 200, res.text
    assert res.json()["username"] == user["username"]
    assert "bs_session" in res.cookies
    assert (await client.get("/api/auth/me")).json()["username"] == user["username"]

    again = await client.post("/api/auth/desktop/exchange", json={"verifier": verifier})
    assert again.status_code == 202, "an approval is single use"


async def test_expired_approval_is_not_redeemable(client: AsyncClient, user: dict):
    verifier, challenge = _pair()
    assert (
        await client.post("/api/auth/desktop/approve", json={"challenge": challenge})
    ).status_code == 204
    async with get_session_factory()() as db:
        row = await db.get(DesktopSignIn, challenge)
        assert row is not None
        row.expires_at = utcnow() - timedelta(minutes=1)
        await db.commit()

    client.cookies.clear()
    res = await client.post("/api/auth/desktop/exchange", json={"verifier": verifier})
    assert res.status_code == 202
    async with get_session_factory()() as db:
        assert await db.get(DesktopSignIn, challenge) is None, "expired rows are dropped"
