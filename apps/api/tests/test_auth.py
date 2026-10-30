from __future__ import annotations

from httpx import AsyncClient


async def test_signup_login_me_logout(client: AsyncClient):
    res = await client.post(
        "/api/auth/sign-up",
        json={
            "email": "ada@example.com",
            "username": "ada",
            "password": "correct-horse-battery",
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["username"] == "ada"
    assert body["isAdmin"] is True  # first user is admin

    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "ada@example.com"

    dup = await client.post(
        "/api/auth/sign-up",
        json={"email": "ada@example.com", "username": "ada2", "password": "correct-horse-battery"},
    )
    assert dup.status_code == 409

    out = await client.post("/api/auth/logout")
    assert out.status_code == 204
    assert (await client.get("/api/auth/me")).status_code == 401

    bad = await client.post("/api/auth/login", json={"identifier": "ada", "password": "wrong"})
    assert bad.status_code == 401
    ok = await client.post(
        "/api/auth/login",
        json={"identifier": "ADA@example.com", "password": "correct-horse-battery"},
    )
    assert ok.status_code == 200
    assert (await client.get("/api/auth/me")).status_code == 200


async def test_api_keys_scope(client: AsyncClient, user: dict):
    created = await client.post("/api/api-keys", json={"name": "ci", "scopes": ["read"]})
    assert created.status_code == 201, created.text
    key = created.json()["key"]
    assert key.startswith("bsk_")
    listed = await client.get("/api/api-keys")
    assert listed.json()[0]["keyPrefix"] == key[:12]

    # A read-only key can read but cannot create workspaces.
    client.cookies.clear()
    headers = {"Authorization": f"Bearer {key}"}
    assert (await client.get("/api/auth/me", headers=headers)).status_code == 200
    denied = await client.post("/api/workspaces", json={"name": "x"}, headers=headers)
    assert denied.status_code == 403
    # ...and cannot mint another key.
    assert (
        await client.post("/api/api-keys", json={"name": "y"}, headers=headers)
    ).status_code == 403


async def test_system_info(client: AsyncClient):
    res = await client.get("/api/system/info")
    assert res.status_code == 200
    assert res.json()["aiEnabled"] is False


async def test_stale_session_cookie_is_cleared_by_the_error_response(client: AsyncClient):
    stale = {"cookie": "bs_session=left-over-from-a-reset-database"}
    res = await client.get("/api/auth/me", headers=stale)
    assert res.status_code == 401
    cleared = [c for c in res.headers.get_list("set-cookie") if c.startswith("bs_session=")]
    assert cleared and "Max-Age=0" in cleared[0], res.headers

    public = await client.get("/api/system/info", headers=stale)
    assert public.status_code == 200
    assert "set-cookie" not in public.headers, "only error responses clear the cookie"


async def test_wrong_current_password_keeps_the_session_cookie(client: AsyncClient, user: dict):
    res = await client.post(
        "/api/auth/change-password",
        json={"currentPassword": "not-the-password", "newPassword": "another-correct-horse"},
    )
    assert res.status_code == 401
    assert "set-cookie" not in res.headers
    assert (await client.get("/api/auth/me")).status_code == 200
