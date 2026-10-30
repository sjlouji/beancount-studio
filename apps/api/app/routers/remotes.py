"""Remote repositories: connect, disconnect and sync a ledger; test a repository address."""

from __future__ import annotations

from fastapi import APIRouter, Response

from app.core.deps import DbDep, LedgerAdminDep, LedgerWriteDep, SessionUserDep
from app.errors import NotFoundError
from app.ledgers.remotes import get_remote_sync, parse_source
from app.schemas import GitTestOut, RemoteConnectRequest, RemoteOut, RemoteResolveRequest

router = APIRouter(prefix="/workspaces/{workspace}/ledgers/{slug}/remote", tags=["remotes"])
git_router = APIRouter(prefix="/git", tags=["remotes"])


@git_router.post("/test", response_model=GitTestOut)
async def test_repository(body: RemoteConnectRequest, user: SessionUserDep, db: DbDep):
    """Reach a repository with the given credentials before creating or connecting anything."""
    branch = await get_remote_sync().test(db, user, parse_source(body.url), body.auth, body.token)
    return GitTestOut(default_branch=branch)


@router.put("", response_model=RemoteOut)
async def connect_remote(body: RemoteConnectRequest, access: LedgerAdminDep, db: DbDep):
    remote = await get_remote_sync().connect(
        db, access.ledger, access.auth.user, parse_source(body.url), body.auth, body.token
    )
    return RemoteOut.model_validate(remote)


@router.delete("", status_code=204)
async def disconnect_remote(access: LedgerAdminDep, db: DbDep):
    if access.ledger.remote is None:
        raise NotFoundError("This ledger has no remote")
    await get_remote_sync().disconnect(db, access.ledger)
    return Response(status_code=204)


@router.post("/resolve", response_model=RemoteOut)
async def resolve_remote(body: RemoteResolveRequest, access: LedgerAdminDep, db: DbDep):
    """Settle a divergence by keeping one side; the other side's commits since the split go."""
    remote = await get_remote_sync().resolve(db, access.ledger, body.keep)
    return RemoteOut.model_validate(remote)


@router.post("/sync", response_model=RemoteOut)
async def sync_remote(access: LedgerWriteDep, db: DbDep):
    """Fetch, fast-forward or rebase, then push. Stops with state `diverged` on conflicts."""
    remote = await get_remote_sync().sync(db, access.ledger)
    return RemoteOut.model_validate(remote)
