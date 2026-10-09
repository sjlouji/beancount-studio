"""Profile management, public profiles, and user search."""

from __future__ import annotations

from fastapi import APIRouter, Query, Response
from sqlalchemy import func, select

from app.core.deps import AuthDep, DbDep, SessionUserDep, UserDep, resolve_role
from app.core.security import verify_password
from app.db.models import Ledger, LedgerStar, User
from app.errors import ConflictError, NotFoundError, UnauthorizedError
from app.ledgers.store import get_store
from app.logging_setup import get_logger
from app.schemas import DeleteAccountRequest, PublicUserOut, UpdateProfileRequest, UserOut

log = get_logger(__name__)
router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me", response_model=UserOut)
async def update_me(body: UpdateProfileRequest, user: UserDep, db: DbDep):
    if body.username is not None and body.username != user.username:
        taken = (
            await db.execute(select(User).where(User.username == body.username))
        ).scalar_one_or_none()
        if taken is not None:
            raise ConflictError("That username is already taken")
        user.username = body.username
    for field in ("display_name", "bio", "website", "location"):
        value = getattr(body, field)
        if value is not None:
            setattr(user, field, value.strip())
    if body.preferences is not None:
        user.preferences = {**(user.preferences or {}), **body.preferences}
    await db.commit()
    return UserOut.model_validate(user)


@router.delete("/me", status_code=204)
async def delete_me(body: DeleteAccountRequest, user: SessionUserDep, db: DbDep):
    if not verify_password(body.password, user.password_hash):
        raise UnauthorizedError("Password is incorrect")
    ledgers = (await db.execute(select(Ledger).where(Ledger.owner_id == user.id))).scalars().all()
    store = get_store()
    for ledger in ledgers:
        await store.delete(ledger.id)
    await db.delete(user)
    await db.commit()
    log.info("user %s deleted their account", user.username)
    return Response(status_code=204)


@router.get("/search")
async def search_users(
    q: str = Query(min_length=1, max_length=80), _: UserDep = None, db: DbDep = None
):
    needle = q.strip().lower()
    stmt = (
        select(User)
        .where((User.username.like(f"{needle}%")) | (User.email == needle))
        .order_by(User.username)
        .limit(10)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [{"username": u.username, "displayName": u.display_name} for u in rows]


@router.get("/{username}")
async def public_profile(username: str, db: DbDep, auth: AuthDep):
    user = (
        await db.execute(select(User).where(User.username == username.lower()))
    ).scalar_one_or_none()
    if user is None:
        raise NotFoundError("User not found")
    ledgers = (
        (
            await db.execute(
                select(Ledger).where(Ledger.owner_id == user.id).order_by(Ledger.updated_at.desc())
            )
        )
        .scalars()
        .all()
    )
    visible = []
    for ledger in ledgers:
        role = await resolve_role(db, ledger, auth)
        if role is None:
            continue
        visible.append(
            {
                "owner": user.username,
                "slug": ledger.slug,
                "title": ledger.title,
                "description": ledger.description,
                "visibility": ledger.visibility,
                "starsCount": ledger.stars_count,
                "updatedAt": ledger.updated_at,
            }
        )
    stars = (
        await db.execute(
            select(func.count()).select_from(LedgerStar).where(LedgerStar.user_id == user.id)
        )
    ).scalar_one()
    return {
        "profile": PublicUserOut.model_validate(user).model_dump(by_alias=True),
        "ledgers": visible,
        "starredCount": stars,
        "isSelf": auth.user is not None and auth.user.id == user.id,
    }
