"""Ledger metadata: create/list/update/delete, gallery, stars, collaborators, archive, activity."""

from __future__ import annotations

import re

from fastapi import APIRouter, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import (
    AuthContext,
    AuthDep,
    DbDep,
    LedgerAccess,
    LedgerAdminDep,
    LedgerReadDep,
    UserDep,
    author_for,
    resolve_role,
)
from app.db.models import Ledger, LedgerCollaborator, LedgerStar, User, new_id
from app.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.ledgers.remotes import get_remote_sync, parse_source
from app.ledgers.store import get_store
from app.logging_setup import get_logger
from app.schemas import (
    SLUG_RE,
    CollaboratorOut,
    CollaboratorUpsertRequest,
    LedgerCreateRequest,
    LedgerOut,
    LedgerUpdateRequest,
    RemoteOut,
)

log = get_logger(__name__)
router = APIRouter(prefix="/ledgers", tags=["ledgers"])


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:80] or "ledger"


async def _is_starred(db: AsyncSession, auth: AuthContext, ledger_id: str) -> bool:
    if auth.user is None:
        return False
    return (await db.get(LedgerStar, {"user_id": auth.user.id, "ledger_id": ledger_id})) is not None


async def ledger_out(
    db: AsyncSession, ledger: Ledger, access: LedgerAccess, *, with_commit: bool = True
) -> LedgerOut:
    owner = await db.get(User, ledger.owner_id)
    last_commit = None
    if with_commit:
        commits = await get_store().repo(ledger.id).log(limit=1)
        last_commit = commits[0].to_dict() if commits else None
    return LedgerOut(
        id=ledger.id,
        owner=owner.username if owner else "",
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


@router.get("", response_model=list[LedgerOut])
async def list_my_ledgers(user: UserDep, db: DbDep, auth: AuthDep):
    owned = (await db.execute(select(Ledger).where(Ledger.owner_id == user.id))).scalars().all()
    shared_ids = select(LedgerCollaborator.ledger_id).where(LedgerCollaborator.user_id == user.id)
    shared = (await db.execute(select(Ledger).where(Ledger.id.in_(shared_ids)))).scalars().all()
    out: list[LedgerOut] = []
    for ledger in sorted([*owned, *shared], key=lambda row: row.updated_at, reverse=True):
        role = await resolve_role(db, ledger, auth)
        if role is None:
            continue
        out.append(await ledger_out(db, ledger, LedgerAccess(ledger=ledger, role=role, auth=auth)))
    return out


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
    out: list[LedgerOut] = []
    for ledger in rows:
        role = await resolve_role(db, ledger, auth)
        if role is None:
            continue
        out.append(
            await ledger_out(
                db, ledger, LedgerAccess(ledger=ledger, role=role, auth=auth), with_commit=False
            )
        )
    return out


@router.get("/starred", response_model=list[LedgerOut])
async def starred(user: UserDep, db: DbDep, auth: AuthDep):
    ids = select(LedgerStar.ledger_id).where(LedgerStar.user_id == user.id)
    rows = (await db.execute(select(Ledger).where(Ledger.id.in_(ids)))).scalars().all()
    out: list[LedgerOut] = []
    for ledger in rows:
        role = await resolve_role(db, ledger, auth)
        if role is None:
            continue
        out.append(
            await ledger_out(
                db, ledger, LedgerAccess(ledger=ledger, role=role, auth=auth), with_commit=False
            )
        )
    return out


@router.get("/activity")
async def activity(
    user: UserDep, db: DbDep, auth: AuthDep, limit: int = Query(default=20, ge=1, le=100)
):
    """Recent commits across the caller's ledgers (owned and shared)."""
    owned = (await db.execute(select(Ledger).where(Ledger.owner_id == user.id))).scalars().all()
    shared_ids = select(LedgerCollaborator.ledger_id).where(LedgerCollaborator.user_id == user.id)
    shared = (await db.execute(select(Ledger).where(Ledger.id.in_(shared_ids)))).scalars().all()
    items = []
    store = get_store()
    for ledger in [*owned, *shared]:
        owner = await db.get(User, ledger.owner_id)
        commits = await store.repo(ledger.id).log(limit=10)
        for c in commits:
            items.append(
                {
                    **c.to_dict(),
                    "ledger": {
                        "owner": owner.username if owner else "",
                        "slug": ledger.slug,
                        "title": ledger.title,
                    },
                }
            )
    items.sort(key=lambda i: i["author"]["date"], reverse=True)
    return {"items": items[:limit], "total": len(items)}


@router.post("", response_model=LedgerOut, status_code=201)
async def create_ledger(body: LedgerCreateRequest, user: UserDep, db: DbDep, auth: AuthDep):
    if not auth.can_write_scope:
        raise ForbiddenError("This API key is read-only")
    slug = body.slug.strip().lower() if body.slug else slugify(body.title)
    if not SLUG_RE.match(slug):
        raise ValidationError("Slug must be lowercase letters, digits or hyphens")
    exists = (
        await db.execute(select(Ledger).where(Ledger.owner_id == user.id, Ledger.slug == slug))
    ).scalar_one_or_none()
    if exists is not None:
        raise ConflictError(f"You already have a ledger at /{user.username}/{slug}")
    source = parse_source(body.source.url) if body.source is not None else None
    # The repository is prepared before the row exists, so a clone that takes minutes never
    # holds a database write transaction open (SQLite would block every other writer).
    ledger = Ledger(
        id=new_id(),
        owner_id=user.id,
        slug=slug,
        title=body.title.strip(),
        description=body.description.strip(),
        visibility=body.visibility,
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
            ledger.id,
            template=body.template,
            title=ledger.title,
            currency=body.currency,
            author=author_for(user),
        )
    db.add(ledger)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        await get_store().delete(ledger.id)
        raise
    if source is not None:
        log.info("ledger %s/%s created from %s", user.username, slug, source.url)
    else:
        log.info("ledger %s/%s created from template %s", user.username, slug, body.template)
    return await ledger_out(db, ledger, LedgerAccess(ledger=ledger, role="owner", auth=auth))


@router.get("/{owner}/{slug}", response_model=LedgerOut)
async def get_ledger(access: LedgerReadDep, db: DbDep):
    return await ledger_out(db, access.ledger, access)


@router.patch("/{owner}/{slug}", response_model=LedgerOut)
async def update_ledger(body: LedgerUpdateRequest, access: LedgerAdminDep, db: DbDep):
    ledger = access.ledger
    if body.slug is not None and body.slug != ledger.slug:
        slug = body.slug.strip().lower()
        if not SLUG_RE.match(slug):
            raise ValidationError("Slug must be lowercase letters, digits or hyphens")
        clash = (
            await db.execute(
                select(Ledger).where(Ledger.owner_id == ledger.owner_id, Ledger.slug == slug)
            )
        ).scalar_one_or_none()
        if clash is not None:
            raise ConflictError("A ledger with that slug already exists")
        ledger.slug = slug
    if body.title is not None:
        ledger.title = body.title.strip()
    if body.description is not None:
        ledger.description = body.description.strip()
    if body.visibility is not None:
        if not access.is_owner:
            raise ForbiddenError("Only the owner can change visibility")
        ledger.visibility = body.visibility
    await db.commit()
    return await ledger_out(db, ledger, access)


@router.delete("/{owner}/{slug}", status_code=204)
async def delete_ledger(access: LedgerReadDep, db: DbDep):
    if not access.is_owner or access.auth.kind != "session":
        raise ForbiddenError("Only the owner can delete a ledger from a signed-in session")
    await get_store().delete(access.ledger.id)
    await db.delete(access.ledger)
    await db.commit()
    log.info("ledger %s deleted", access.ledger.id)
    return Response(status_code=204)


@router.post("/{owner}/{slug}/star", response_model=LedgerOut)
async def star(access: LedgerReadDep, user: UserDep, db: DbDep):
    if await db.get(LedgerStar, {"user_id": user.id, "ledger_id": access.ledger.id}) is None:
        db.add(LedgerStar(user_id=user.id, ledger_id=access.ledger.id))
        access.ledger.stars_count = (access.ledger.stars_count or 0) + 1
        await db.commit()
    return await ledger_out(db, access.ledger, access, with_commit=False)


@router.delete("/{owner}/{slug}/star", response_model=LedgerOut)
async def unstar(access: LedgerReadDep, user: UserDep, db: DbDep):
    row = await db.get(LedgerStar, {"user_id": user.id, "ledger_id": access.ledger.id})
    if row is not None:
        await db.delete(row)
        access.ledger.stars_count = max(0, (access.ledger.stars_count or 0) - 1)
        await db.commit()
    return await ledger_out(db, access.ledger, access, with_commit=False)


@router.get("/{owner}/{slug}/collaborators", response_model=list[CollaboratorOut])
async def list_collaborators(access: LedgerReadDep, db: DbDep):
    rows = (
        await db.execute(
            select(LedgerCollaborator, User)
            .join(User, User.id == LedgerCollaborator.user_id)
            .where(LedgerCollaborator.ledger_id == access.ledger.id)
            .order_by(User.username)
        )
    ).all()
    return [
        CollaboratorOut(
            username=u.username, display_name=u.display_name, role=c.role, created_at=c.created_at
        )
        for c, u in rows
    ]


@router.put("/{owner}/{slug}/collaborators/{username}", response_model=CollaboratorOut)
async def upsert_collaborator(
    username: str, body: CollaboratorUpsertRequest, access: LedgerAdminDep, db: DbDep
):
    target = (
        await db.execute(select(User).where(User.username == username.lower()))
    ).scalar_one_or_none()
    if target is None:
        raise NotFoundError("User not found")
    if target.id == access.ledger.owner_id:
        raise ValidationError("The owner already has full access")
    row = await db.get(LedgerCollaborator, {"ledger_id": access.ledger.id, "user_id": target.id})
    if row is None:
        row = LedgerCollaborator(ledger_id=access.ledger.id, user_id=target.id, role=body.role)
        db.add(row)
    else:
        row.role = body.role
    await db.commit()
    await db.refresh(row)
    return CollaboratorOut(
        username=target.username,
        display_name=target.display_name,
        role=row.role,
        created_at=row.created_at,
    )


@router.delete("/{owner}/{slug}/collaborators/{username}", status_code=204)
async def remove_collaborator(username: str, access: LedgerReadDep, user: UserDep, db: DbDep):
    target = (
        await db.execute(select(User).where(User.username == username.lower()))
    ).scalar_one_or_none()
    if target is None:
        raise NotFoundError("User not found")
    # A collaborator may remove themselves; otherwise admin is required.
    if target.id != user.id and not access.can_admin:
        raise ForbiddenError("You need admin access to remove collaborators")
    row = await db.get(LedgerCollaborator, {"ledger_id": access.ledger.id, "user_id": target.id})
    if row is not None:
        await db.delete(row)
        await db.commit()
    return Response(status_code=204)


@router.get("/{owner}/{slug}/archive")
async def archive(access: LedgerReadDep):
    data = await get_store().repo(access.ledger.id).archive_zip()
    filename = f"{access.ledger.slug}.zip"
    return StreamingResponse(
        iter([data]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
