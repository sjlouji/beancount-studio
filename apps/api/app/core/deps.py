"""FastAPI dependencies: authentication (session cookie or API key) and ledger access."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.core.security import hash_token
from app.db.base import get_db
from app.db.models import ApiKey, Ledger, LedgerCollaborator, Session, User, utcnow
from app.errors import ForbiddenError, NotFoundError, UnauthorizedError

Role = Literal["owner", "admin", "write", "read", "public"]
_ROLE_RANK: dict[str, int] = {"public": 0, "read": 1, "write": 2, "admin": 3, "owner": 4}


@dataclass
class AuthContext:
    user: User | None
    kind: Literal["session", "api_key", "anonymous"]
    scopes: tuple[str, ...] = ("read", "write")
    api_key_ledger_id: str | None = None

    @property
    def can_write_scope(self) -> bool:
        return "write" in self.scopes


@dataclass
class LedgerAccess:
    ledger: Ledger
    role: Role
    auth: AuthContext

    @property
    def can_read(self) -> bool:
        return True

    @property
    def can_write(self) -> bool:
        return _ROLE_RANK[self.role] >= _ROLE_RANK["write"] and self.auth.can_write_scope

    @property
    def can_admin(self) -> bool:
        return _ROLE_RANK[self.role] >= _ROLE_RANK["admin"] and self.auth.can_write_scope

    @property
    def is_owner(self) -> bool:
        return self.role == "owner"


SettingsDep = Annotated[Settings, Depends(get_settings)]
DbDep = Annotated[AsyncSession, Depends(get_db)]


async def _user_from_session(db: AsyncSession, token: str, settings: Settings) -> User | None:
    row = await db.get(Session, hash_token(token))
    if row is None:
        return None
    now = utcnow()
    expires = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=UTC)
    if expires < now:
        await db.delete(row)
        await db.commit()
        return None
    last_seen = (
        row.last_seen_at if row.last_seen_at.tzinfo else row.last_seen_at.replace(tzinfo=UTC)
    )
    if now - last_seen > timedelta(minutes=10):
        row.last_seen_at = now
        row.expires_at = now + timedelta(days=settings.session_ttl_days)
        await db.commit()
    return await db.get(User, row.user_id)


async def _auth_from_api_key(db: AsyncSession, key: str) -> AuthContext | None:
    row = (
        await db.execute(select(ApiKey).where(ApiKey.key_hash == hash_token(key)))
    ).scalar_one_or_none()
    if row is None or row.revoked_at is not None:
        return None
    if row.expires_at is not None:
        expires = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=UTC)
        if expires < utcnow():
            return None
    row.last_used_at = utcnow()
    await db.commit()
    user = await db.get(User, row.user_id)
    if user is None:
        return None
    return AuthContext(
        user=user,
        kind="api_key",
        scopes=tuple(row.scopes or ["read"]),
        api_key_ledger_id=row.ledger_id,
    )


async def get_auth(request: Request, db: DbDep, settings: SettingsDep) -> AuthContext:
    cached = getattr(request.state, "auth", None)
    if cached is not None:
        return cached
    auth = AuthContext(user=None, kind="anonymous", scopes=())
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        token = header[7:].strip()
        if token.startswith("bsk_"):
            found = await _auth_from_api_key(db, token)
            if found is None:
                raise UnauthorizedError("Invalid or revoked API key")
            auth = found
        else:
            user = await _user_from_session(db, token, settings)
            if user is not None:
                auth = AuthContext(user=user, kind="session")
    else:
        cookie = request.cookies.get(settings.cookie_name)
        if cookie:
            user = await _user_from_session(db, cookie, settings)
            if user is not None:
                auth = AuthContext(user=user, kind="session")
            else:
                # The cookie names a session that no longer exists (signed out elsewhere, expired,
                # database reset). The web proxy treats the cookie's presence as "signed in", so
                # the error response has to clear it or /login stays unreachable from this browser.
                request.state.stale_session_cookie = settings.cookie_name
    request.state.auth = auth
    return auth


AuthDep = Annotated[AuthContext, Depends(get_auth)]


async def require_user(auth: AuthDep) -> User:
    if auth.user is None:
        raise UnauthorizedError("Sign in required")
    return auth.user


UserDep = Annotated[User, Depends(require_user)]


async def require_session_user(auth: AuthDep) -> User:
    """Operations an API key must never perform (minting keys, deleting the account)."""
    if auth.user is None:
        raise UnauthorizedError("Sign in required")
    if auth.kind != "session":
        raise ForbiddenError("This action requires a signed-in browser session")
    return auth.user


SessionUserDep = Annotated[User, Depends(require_session_user)]


async def find_ledger(db: AsyncSession, owner: str, slug: str) -> Ledger | None:
    stmt = (
        select(Ledger)
        .join(User, User.id == Ledger.owner_id)
        .where(User.username == owner, Ledger.slug == slug)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def resolve_role(db: AsyncSession, ledger: Ledger, auth: AuthContext) -> Role | None:
    """Return the effective role, or None when the ledger is invisible to this caller."""
    user = auth.user
    if auth.kind == "api_key" and auth.api_key_ledger_id and auth.api_key_ledger_id != ledger.id:
        return "public" if ledger.visibility == "public" else None
    if user is not None:
        if ledger.owner_id == user.id:
            return "owner"
        collab = await db.get(LedgerCollaborator, {"ledger_id": ledger.id, "user_id": user.id})
        if collab is not None:
            return collab.role  # type: ignore[return-value]
    if ledger.visibility == "public":
        return "public"
    return None


async def get_ledger_access(owner: str, slug: str, db: DbDep, auth: AuthDep) -> LedgerAccess:
    ledger = await find_ledger(db, owner, slug)
    if ledger is None:
        raise NotFoundError("Ledger not found")
    role = await resolve_role(db, ledger, auth)
    if role is None:
        if auth.user is None:
            raise UnauthorizedError("Sign in to view this ledger")
        raise NotFoundError("Ledger not found")
    return LedgerAccess(ledger=ledger, role=role, auth=auth)


LedgerReadDep = Annotated[LedgerAccess, Depends(get_ledger_access)]


async def require_ledger_write(access: LedgerReadDep) -> LedgerAccess:
    if access.auth.user is None:
        raise UnauthorizedError("Sign in to edit this ledger")
    if not access.can_write:
        raise ForbiddenError("You need write access to this ledger")
    return access


async def require_ledger_admin(access: LedgerReadDep) -> LedgerAccess:
    if access.auth.user is None:
        raise UnauthorizedError("Sign in to manage this ledger")
    if not access.can_admin:
        raise ForbiddenError("You need admin access to this ledger")
    return access


LedgerWriteDep = Annotated[LedgerAccess, Depends(require_ledger_write)]
LedgerAdminDep = Annotated[LedgerAccess, Depends(require_ledger_admin)]


def author_for(user: User):
    from app.ledgers.git import Author

    return Author(name=user.display_name or user.username, email=user.email)


def now_plus(days: int) -> datetime:
    return utcnow() + timedelta(days=days)
