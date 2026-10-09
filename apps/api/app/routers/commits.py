"""Version history for a ledger."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.core.deps import LedgerReadDep
from app.ledgers.store import get_store

router = APIRouter(prefix="/ledgers/{owner}/{slug}/commits", tags=["commits"])


@router.get("")
async def list_commits(
    access: LedgerReadDep,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=30, ge=1, le=100),
    path: str | None = Query(default=None),
):
    repo = get_store().repo(access.ledger.id)
    commits = await repo.log(limit=limit, skip=(page - 1) * limit, path=path)
    total = await repo.count_commits(path=path)
    return {"commits": [c.to_dict() for c in commits], "total": total, "page": page, "limit": limit}


@router.get("/{sha}")
async def commit_details(sha: str, access: LedgerReadDep):
    details = await get_store().repo(access.ledger.id).show(sha)
    return details.to_dict()
