"""Ledger metadata: list, create, update, delete, gallery, stars, archive, activity."""

from __future__ import annotations

from fastapi import APIRouter, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import (
    LEDGER_ROLE_FOR,
    AuthContext,
    AuthDep,
    DbDep,
    LedgerAccess,
    LedgerAdminDep,
    LedgerReadDep,
    UserDep,
    WorkspaceDep,
    author_for,
    resolve_role,
)
from app.db.models import Ledger, LedgerStar, Workspace, WorkspaceMember, new_id
from app.errors import ConflictError, ForbiddenError, ValidationError
from app.ledgers.remotes import get_remote_sync, parse_source
from app.ledgers.store import get_store
from app.logging_setup import get_logger
from app.schemas import (
    LedgerCreateRequest,
    LedgerOut,
    LedgerUpdateRequest,
    RemoteOut,
    ledger_slug_error,
    slugify,
)

log = get_logger(__name__)
router = APIRouter(prefix="/ledgers", tags=["ledgers"])
workspace_router = APIRouter(prefix="/workspaces/{workspace}/ledgers", tags=["ledgers"])


async def _is_starred(db: AsyncSession, auth: AuthContext, ledger_id: str) -> bool:
    if auth.user is None:
        return False
    return (await db.get(LedgerStar, {"user_id": auth.user.id, "ledger_id": ledger_id})) is not None


async def ledger_out(
    db: AsyncSession, ledger: Ledger, access: LedgerAccess, *, with_commit: bool = True
) -> LedgerOut:
    last_commit = None
    if with_commit:
        commits = await get_store().repo(ledger).log(limit=1)
        last_commit = commits[0].to_dict() if commits else None
    return LedgerOut(
        id=ledger.id,
        workspace=ledger.workspace.slug,
        slug=ledger.slug,
        title=ledger.title,
        description=ledger.description,
        visibility=ledger.visibility,
        role=access.role,
        can_write=access.can_write,
        can_admin=access.can_admin,
        is_starred=await _is_starred(db, access.auth, ledger.id),
        stars_count=ledger.stars_count,
        created_at=ledger.created_at,
        updated_at=ledger.updated_at,
        last_commit=last_commit,
        # The URL may be a server path and the last error raw git output: writers only.
        remote=RemoteOut.model_validate(ledger.remote)
        if ledger.remote is not None and access.can_write
        else None,
    )


def _my_ledgers(user_id: str):
    """Every ledger in a workspace the person belongs to, most recently changed first."""
    return (
        select(Ledger)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Ledger.workspace_id)
        .where(WorkspaceMember.user_id == user_id)
        .order_by(Ledger.updated_at.desc())
    )


async def _visible(
    db: AsyncSession, ledgers: list[Ledger], auth: AuthContext, *, with_commit: bool
) -> list[LedgerOut]:
    out: list[LedgerOut] = []
    for ledger in ledgers:
        role = await resolve_role(db, ledger, auth)
        if role is None:
            continue
        access = LedgerAccess(ledger=ledger, role=role, auth=auth)
        out.append(await ledger_out(db, ledger, access, with_commit=with_commit))
    return out


@router.get("", response_model=list[LedgerOut])
async def list_my_ledgers(user: UserDep, db: DbDep, auth: AuthDep):
    rows = (await db.execute(_my_ledgers(user.id))).scalars().all()
    return await _visible(db, list(rows), auth, with_commit=True)


@router.get("/gallery", response_model=list[LedgerOut])
async def gallery(db: DbDep, auth: AuthDep, q: str | None = Query(default=None, max_length=80)):
    stmt = select(Ledger).where(Ledger.visibility == "public")
    if q:
        needle = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(func.lower(Ledger.title).like(needle), func.lower(Ledger.description).like(needle))
        )
    rows = (
        (
            await db.execute(
                stmt.order_by(Ledger.stars_count.desc(), Ledger.updated_at.desc()).limit(60)
            )
        )
        .scalars()
        .all()
    )
    return await _visible(db, list(rows), auth, with_commit=False)


@router.get("/starred", response_model=list[LedgerOut])
async def starred(user: UserDep, db: DbDep, auth: AuthDep):
    ids = select(LedgerStar.ledger_id).where(LedgerStar.user_id == user.id)
    rows = (await db.execute(select(Ledger).where(Ledger.id.in_(ids)))).scalars().all()
    return await _visible(db, list(rows), auth, with_commit=False)


@router.get("/activity")
async def activity(
    user: UserDep,
    db: DbDep,
    limit: int = Query(default=20, ge=1, le=100),
    workspace: str | None = Query(default=None, max_length=40),
):
    """Recent commits across the caller's ledgers, in every workspace or just one."""
    stmt = _my_ledgers(user.id)
    if workspace:
        stmt = stmt.join(Workspace, Workspace.id == Ledger.workspace_id).where(
            Workspace.slug == workspace
        )
    rows = (await db.execute(stmt)).scalars().all()
    items = []
    store = get_store()
    for ledger in rows:
        commits = await store.repo(ledger).log(limit=10)
        for c in commits:
            items.append(
                {
                    **c.to_dict(),
                    "ledger": {
                        "workspace": ledger.workspace.slug,
                        "slug": ledger.slug,
                        "title": ledger.title,
                    },
                }
            )
    items.sort(key=lambda i: i["author"]["date"], reverse=True)
    return {"items": items[:limit], "total": len(items)}


@workspace_router.get("", response_model=list[LedgerOut])
async def list_workspace_ledgers(access: WorkspaceDep, db: DbDep):
    rows = (
        (
            await db.execute(
                select(Ledger)
                .where(Ledger.workspace_id == access.workspace.id)
                .order_by(Ledger.updated_at.desc())
            )
        )
        .scalars()
        .all()
    )
    role = LEDGER_ROLE_FOR[access.role]
    return [
        await ledger_out(db, ledger, LedgerAccess(ledger=ledger, role=role, auth=access.auth))
        for ledger in rows
    ]


@workspace_router.post("", response_model=LedgerOut, status_code=201)
async def create_ledger(body: LedgerCreateRequest, access: WorkspaceDep, db: DbDep):
    if not access.auth.can_write_scope:
        raise ForbiddenError("This API key is read-only")
    if not access.can_write:
        raise ForbiddenError("Viewers cannot create ledgers in this workspace")
    user = access.user
    workspace = access.workspace
    slug = body.slug.strip().lower() if body.slug else slugify(body.title) or "ledger"
    if problem := ledger_slug_error(slug):
        raise ValidationError(problem)
    exists = (
        await db.execute(
            select(Ledger).where(Ledger.workspace_id == workspace.id, Ledger.slug == slug)
        )
    ).scalar_one_or_none()
    if exists is not None:
        raise ConflictError(f"A ledger already lives at /{workspace.slug}/{slug}")
    source = parse_source(body.source.url) if body.source is not None else None
    # The repository is prepared before the row exists, so a clone that takes minutes never
    # holds a database write transaction open (SQLite would block every other writer).
    ledger = Ledger(
        id=new_id(),
        workspace_id=workspace.id,
        workspace=workspace,
        slug=slug,
        title=body.title.strip(),
        description=body.description.strip(),
        visibility=body.visibility,
        main_file="main.bean",
        remote=None,
    )
    if body.source is not None and source is not None:
        ledger.main_file = await get_remote_sync().clone(
            db,
            ledger,
            user,
            source,
            body.source.auth,
            body.source.token,
            body.source.main_file,
        )
    else:
        await get_store().create(
            ledger,
            template=body.template,
            title=ledger.title,
            currency=body.currency,
            author=author_for(user),
            fiscal_year_end=body.fiscal_year_end,
        )
    db.add(ledger)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        await get_store().delete(ledger)
        raise
    if source is not None:
        log.info("ledger %s/%s created from %s", workspace.slug, slug, source.url)
    else:
        log.info("ledger %s/%s created from template %s", workspace.slug, slug, body.template)
    role = LEDGER_ROLE_FOR[access.role]
    return await ledger_out(db, ledger, LedgerAccess(ledger=ledger, role=role, auth=access.auth))


@workspace_router.get("/{slug}", response_model=LedgerOut)
async def get_ledger(access: LedgerReadDep, db: DbDep):
    return await ledger_out(db, access.ledger, access)


@workspace_router.patch("/{slug}", response_model=LedgerOut)
async def update_ledger(body: LedgerUpdateRequest, access: LedgerAdminDep, db: DbDep):
    ledger = access.ledger
    if body.slug is not None and body.slug != ledger.slug:
        slug = body.slug.strip().lower()
        if problem := ledger_slug_error(slug):
            raise ValidationError(problem)
        clash = (
            await db.execute(
                select(Ledger).where(
                    Ledger.workspace_id == ledger.workspace_id, Ledger.slug == slug
                )
            )
        ).scalar_one_or_none()
        if clash is not None:
            raise ConflictError("A ledger with that slug already exists in this workspace")
        ledger.slug = slug
    if body.title is not None:
        ledger.title = body.title.strip()
    if body.description is not None:
        ledger.description = body.description.strip()
    if body.visibility is not None:
        ledger.visibility = body.visibility
    await db.commit()
    return await ledger_out(db, ledger, access)


@workspace_router.delete("/{slug}", status_code=204)
async def delete_ledger(access: LedgerReadDep, db: DbDep):
    if not access.can_admin or access.auth.kind != "session":
        raise ForbiddenError("Only a workspace admin can delete a ledger, from a signed-in session")
    await get_store().delete(access.ledger)
    await db.delete(access.ledger)
    await db.commit()
    log.info("ledger %s deleted", access.ledger.id)
    return Response(status_code=204)


@workspace_router.post("/{slug}/star", response_model=LedgerOut)
async def star(access: LedgerReadDep, user: UserDep, db: DbDep):
    if await db.get(LedgerStar, {"user_id": user.id, "ledger_id": access.ledger.id}) is None:
        db.add(LedgerStar(user_id=user.id, ledger_id=access.ledger.id))
        access.ledger.stars_count = (access.ledger.stars_count or 0) + 1
        await db.commit()
    return await ledger_out(db, access.ledger, access, with_commit=False)


@workspace_router.delete("/{slug}/star", response_model=LedgerOut)
async def unstar(access: LedgerReadDep, user: UserDep, db: DbDep):
    row = await db.get(LedgerStar, {"user_id": user.id, "ledger_id": access.ledger.id})
    if row is not None:
        await db.delete(row)
        access.ledger.stars_count = max(0, (access.ledger.stars_count or 0) - 1)
        await db.commit()
    return await ledger_out(db, access.ledger, access, with_commit=False)


@workspace_router.get("/{slug}/archive")
async def archive(access: LedgerReadDep):
    data = await get_store().repo(access.ledger).archive_zip()
    filename = f"{access.ledger.slug}.zip"
    return StreamingResponse(
        iter([data]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
