"""Workspaces: creation, membership roles, invite links, deletion and account clean-up."""

from __future__ import annotations

import uuid
from datetime import timedelta

from httpx import AsyncClient
from sqlalchemy import select

from app.db.base import get_session_factory
from app.db.models import Ledger, WorkspaceInvite, utcnow
from app.ledgers.store import get_store

PASSWORD = "correct-horse-battery"


async def persona(client: AsyncClient, prefix: str = "p") -> tuple[AsyncClient, dict]:
    """A fresh account with its own cookie jar, so several people can act in one test."""
    other = AsyncClient(transport=client._transport, base_url="http://test")
    name = f"{prefix}{uuid.uuid4().hex[:8]}"
    res = await other.post(
        "/api/auth/sign-up",
        json={
            "email": f"{name}@example.com",
            "username": name,
            "password": PASSWORD,
        },
    )
    assert res.status_code == 201, res.text
    return other, res.json()


async def invite(client: AsyncClient, workspace: str, role: str, days: int = 7) -> str:
    """Create an invite link as the current client and return its token."""
    res = await client.post(
        f"/api/workspaces/{workspace}/invites", json={"role": role, "expiresInDays": days}
    )
    assert res.status_code == 201, res.text
    assert res.json()["url"].rsplit("/invite/", 1)[0]
    return res.json()["url"].rsplit("/", 1)[1]


async def join(client: AsyncClient, token: str) -> dict:
    res = await client.post(f"/api/invites/{token}/accept")
    assert res.status_code == 200, res.text
    return res.json()


def _base(ledger: dict) -> str:
    return f"/api/workspaces/{ledger['workspace']}/ledgers/{ledger['slug']}"


async def test_create_list_update_workspace(client: AsyncClient, user: dict):
    tag = uuid.uuid4().hex[:8]
    created = await client.post("/api/workspaces", json={"name": f"Acme Books {tag}"})
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["slug"] == f"acme-books-{tag}"
    assert body["role"] == "owner"
    assert (body["membersCount"], body["ledgersCount"]) == (1, 0)

    listed = await client.get("/api/workspaces")
    assert any(item["id"] == body["id"] for item in listed.json())
    assert (
        await client.post("/api/workspaces", json={"name": f"acme books {tag}"})
    ).status_code == 409
    assert (
        await client.post("/api/workspaces", json={"name": "Me", "slug": "x"})
    ).status_code == 422

    renamed = await client.patch(
        f"/api/workspaces/{body['slug']}", json={"name": "Acme", "slug": f"acme-{tag}"}
    )
    assert renamed.status_code == 200, renamed.text
    assert (renamed.json()["name"], renamed.json()["slug"]) == ("Acme", f"acme-{tag}")
    assert (await client.get(f"/api/workspaces/{body['slug']}")).status_code == 404
    assert (await client.get(f"/api/workspaces/acme-{tag}")).status_code == 200


async def test_members_see_every_ledger_with_their_role(
    client: AsyncClient, user: dict, workspace: dict, ledger: dict
):
    base = _base(ledger)
    slug = workspace["slug"]
    viewer, viewer_user = await persona(client, "viewer")
    member, _ = await persona(client, "member")
    stranger, _ = await persona(client, "stranger")

    assert (await stranger.get(base)).status_code == 404
    assert (await stranger.get(f"/api/workspaces/{slug}")).status_code == 404
    assert (await viewer.get(base)).status_code == 404

    await join(viewer, await invite(client, slug, "viewer"))
    await join(member, await invite(client, slug, "member"))

    seen = await viewer.get(base)
    assert seen.status_code == 200 and seen.json()["role"] == "read"
    assert seen.json()["remote"] is None, "remote details are for writers"
    assert (
        await viewer.post(f"{base}/files", json={"path": "x.bean", "content": ""})
    ).status_code == 403
    assert (
        await viewer.post(
            f"/api/workspaces/{slug}/ledgers", json={"title": "Mine", "template": "blank"}
        )
    ).status_code == 403
    mine = await viewer.get("/api/ledgers")
    assert [item["role"] for item in mine.json() if item["id"] == ledger["id"]] == ["read"]
    assert [
        w["role"] for w in (await viewer.get("/api/workspaces")).json() if w["slug"] == slug
    ] == ["viewer"]

    assert (
        await member.post(f"{base}/files", json={"path": "x.bean", "content": ""})
    ).status_code == 201
    assert (await member.patch(base, json={"title": "Renamed"})).status_code == 403
    assert (await member.delete(base)).status_code == 403
    assert (await member.get(f"/api/workspaces/{slug}/invites")).status_code == 403

    promoted = await client.patch(
        f"/api/workspaces/{slug}/members/{viewer_user['username']}", json={"role": "admin"}
    )
    assert promoted.status_code == 200 and promoted.json()["role"] == "admin"
    assert (await viewer.patch(base, json={"title": "Renamed"})).status_code == 200
    members = await viewer.get(f"/api/workspaces/{slug}/members")
    assert {m["username"]: m["role"] for m in members.json()}[user["username"]] == "owner"
    assert len(members.json()) == 3


async def test_role_rules(client: AsyncClient, user: dict, workspace: dict):
    slug = workspace["slug"]
    admin, admin_user = await persona(client, "admin")
    member, member_user = await persona(client, "member")
    await join(admin, await invite(client, slug, "admin"))
    await join(member, await invite(client, slug, "member"))
    me, him, owner = admin_user["username"], member_user["username"], user["username"]

    assert (
        await admin.patch(f"/api/workspaces/{slug}/members/{me}", json={"role": "owner"})
    ).status_code == 422
    assert (
        await admin.patch(f"/api/workspaces/{slug}/members/{owner}", json={"role": "member"})
    ).status_code == 403
    assert (await admin.delete(f"/api/workspaces/{slug}/members/{owner}")).status_code == 403
    assert (
        await admin.patch(f"/api/workspaces/{slug}/members/{him}", json={"role": "owner"})
    ).status_code == 403
    assert (
        await admin.patch(f"/api/workspaces/{slug}/members/{him}", json={"role": "viewer"})
    ).status_code == 200
    assert (await member.delete(f"/api/workspaces/{slug}/members/{me}")).status_code == 403
    assert (await admin.delete(f"/api/workspaces/{slug}/members/{him}")).status_code == 204
    assert (await member.get(f"/api/workspaces/{slug}")).status_code == 404
    assert (await admin.delete(f"/api/workspaces/{slug}/members/{him}")).status_code == 404

    # The last owner stays until ownership moves on.
    assert (await client.delete(f"/api/workspaces/{slug}/members/{owner}")).status_code == 409
    assert (
        await client.patch(f"/api/workspaces/{slug}/members/{me}", json={"role": "owner"})
    ).status_code == 200
    assert (await client.delete(f"/api/workspaces/{slug}/members/{owner}")).status_code == 204
    assert (await client.get(f"/api/workspaces/{slug}")).status_code == 404
    assert (await admin.delete(f"/api/workspaces/{slug}/members/{me}")).status_code == 409


async def test_invite_links(client: AsyncClient, user: dict, workspace: dict):
    slug = workspace["slug"]
    anonymous = AsyncClient(transport=client._transport, base_url="http://test")
    token = await invite(client, slug, "member", days=1)

    preview = await anonymous.get(f"/api/invites/{token}")
    assert preview.status_code == 200, preview.text
    assert preview.json()["workspaceSlug"] == slug
    assert preview.json()["role"] == "member"
    assert preview.json()["invitedBy"] == user["username"]
    assert preview.json()["alreadyMember"] is False
    assert (await client.get(f"/api/invites/{token}")).json()["alreadyMember"] is True
    assert (await anonymous.post(f"/api/invites/{token}/accept")).status_code == 401

    listed = await client.get(f"/api/workspaces/{slug}/invites")
    assert [item["role"] for item in listed.json()] == ["member"]
    assert "token" not in listed.text and "url" not in listed.text

    joiner, _ = await persona(client, "joiner")
    joined = await join(joiner, token)
    assert joined["role"] == "member"
    assert (await join(joiner, token))["role"] == "member", "accepting twice changes nothing"
    assert (await client.get(f"/api/workspaces/{slug}/invites")).json()[0]["uses"] == 1

    revoked = await client.delete(f"/api/workspaces/{slug}/invites/{listed.json()[0]['id']}")
    assert revoked.status_code == 204
    assert (await anonymous.get(f"/api/invites/{token}")).status_code == 404
    assert (await client.get(f"/api/workspaces/{slug}/invites")).json() == []

    stale = await invite(client, slug, "viewer")
    async with get_session_factory()() as db:
        row = (
            await db.execute(
                select(WorkspaceInvite).where(
                    WorkspaceInvite.workspace_id == workspace["id"],
                    WorkspaceInvite.revoked_at.is_(None),
                )
            )
        ).scalar_one()
        row.expires_at = utcnow() - timedelta(minutes=1)
        await db.commit()
    expired = await anonymous.get(f"/api/invites/{stale}")
    assert expired.status_code == 404 and "expired" in expired.json()["error"]["message"]
    assert (await client.get("/api/invites/not-a-token")).status_code == 404
    assert (
        await client.post(f"/api/workspaces/{slug}/invites", json={"role": "owner"})
    ).status_code == 422


async def test_deleting_a_workspace_removes_its_ledgers_from_disk(
    client: AsyncClient, user: dict, workspace: dict, ledger: dict
):
    slug = workspace["slug"]
    async with get_session_factory()() as db:
        row = await db.get(Ledger, ledger["id"])
        repo = get_store().paths(row).repo
        workspace_dir = get_store().storage.workspace_dir(workspace["id"])
    assert (repo / "main.bean").exists()

    admin, _ = await persona(client, "admin")
    await join(admin, await invite(client, slug, "admin"))
    assert (await admin.delete(f"/api/workspaces/{slug}")).status_code == 403, "owners only"

    assert (await client.delete(f"/api/workspaces/{slug}")).status_code == 204
    assert not workspace_dir.exists()
    assert (await client.get(_base(ledger))).status_code == 404
    assert all(item["id"] != ledger["id"] for item in (await client.get("/api/ledgers")).json())
    assert all(item["slug"] != slug for item in (await admin.get("/api/workspaces")).json())


async def test_account_deletion_and_shared_workspaces(
    client: AsyncClient, user: dict, workspace: dict, ledger: dict
):
    slug = workspace["slug"]
    member, _ = await persona(client, "member")
    await join(member, await invite(client, slug, "member"))

    refused = await client.request("DELETE", "/api/users/me", json={"password": PASSWORD})
    assert refused.status_code == 409, "the only owner cannot leave people behind without one"

    gone = await member.request("DELETE", "/api/users/me", json={"password": PASSWORD})
    assert gone.status_code == 204
    assert (await client.get(f"/api/workspaces/{slug}")).json()["membersCount"] == 1

    workspace_dir = get_store().storage.workspace_dir(workspace["id"])
    assert workspace_dir.exists()
    assert (
        await client.request("DELETE", "/api/users/me", json={"password": PASSWORD})
    ).status_code == 204
    assert not workspace_dir.exists(), "a workspace with nobody left goes with the account"


async def test_sign_up_starts_without_a_workspace(client: AsyncClient):
    """Onboarding (create a workspace or accept an invite) happens after the account exists."""
    fresh, _ = await persona(client, "solo")
    assert (await fresh.get("/api/workspaces")).json() == []
    assert (await fresh.get("/api/ledgers")).json() == []


async def test_a_ledger_scoped_api_key_stays_out_of_workspace_endpoints(
    client: AsyncClient, user: dict, workspace: dict, ledger: dict
):
    minted = await client.post(
        "/api/api-keys", json={"name": "one ledger", "scopes": ["read"], "ledgerId": ledger["id"]}
    )
    assert minted.status_code == 201, minted.text
    headers = {"Authorization": f"Bearer {minted.json()['key']}"}
    client.cookies.clear()
    assert (await client.get(_base(ledger), headers=headers)).status_code == 200
    assert (await client.get("/api/workspaces", headers=headers)).status_code == 403
    assert (
        await client.get(f"/api/workspaces/{workspace['slug']}", headers=headers)
    ).status_code == 403
