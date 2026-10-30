"""Profile management, public profiles, and user search."""

from __future__ import annotations

from fastapi import APIRouter, Query, Response
from sqlalchemy import func, select

from app.core.deps import AuthDep, DbDep, SessionUserDep, SettingsDep, UserDep
from app.core.security import encrypt_secret, generate_ssh_keypair, verify_password
from app.db.models import (
    Ledger,
    LedgerRemote,
    LedgerStar,
    User,
    UserSshKey,
    Workspace,
    WorkspaceMember,
)
from app.errors import ConflictError, NotFoundError, UnauthorizedError
from app.ledgers.store import get_store
from app.logging_setup import get_logger
from app.schemas import (
    DeleteAccountRequest,
    PublicUserOut,
    SshKeyOut,
    UpdateProfileRequest,
    UserOut,
)

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
    """Workspaces where the person is alone go with the account; shared ones must keep an owner."""
    if not verify_password(body.password, user.password_hash):
        raise UnauthorizedError("Password is incorrect")
    memberships = (
        await db.execute(
            select(WorkspaceMember, Workspace)
            .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
            .where(WorkspaceMember.user_id == user.id)
        )
    ).all()
    alone: list[Workspace] = []
    for member, workspace in memberships:
        others = (
            await db.execute(
                select(WorkspaceMember.user_id, WorkspaceMember.role).where(
                    WorkspaceMember.workspace_id == workspace.id,
                    WorkspaceMember.user_id != user.id,
                )
            )
        ).all()
        if not others:
            alone.append(workspace)
        elif member.role == "owner" and not any(role == "owner" for _, role in others):
            raise ConflictError(
                f"You are the only owner of the workspace '{workspace.name}'. "
                "Make someone else an owner or delete it first."
            )
    store = get_store()
    for workspace in alone:
        ledger_ids = (
            (await db.execute(select(Ledger.id).where(Ledger.workspace_id == workspace.id)))
            .scalars()
            .all()
        )
        await store.delete_workspace(workspace.id, ledger_ids)
        await db.delete(workspace)
    await db.delete(user)
    await db.commit()
    log.info(
        "user %s deleted their account (%d workspace(s) went with it)", user.username, len(alone)
    )
    return Response(status_code=204)


@router.get("/me/ssh-key", response_model=SshKeyOut)
async def get_ssh_key(user: UserDep, db: DbDep):
    row = await db.get(UserSshKey, user.id)
    if row is None:
        raise NotFoundError("You have no SSH key yet")
    return SshKeyOut.model_validate(row)


@router.post("/me/ssh-key", response_model=SshKeyOut, status_code=201)
async def create_ssh_key(user: SessionUserDep, db: DbDep, settings: SettingsDep):
    """One keypair per account, generated here; add the public key to your git host once."""
    if await db.get(UserSshKey, user.id) is not None:
        raise ConflictError("You already have an SSH key; remove it first to generate a new one")
    private_key, public_key, fingerprint = generate_ssh_keypair(f"beancount-studio:{user.username}")
    row = UserSshKey(
        user_id=user.id,
        public_key=public_key,
        private_key_ciphertext=encrypt_secret(private_key, settings.secret_key),
        fingerprint=fingerprint,
    )
    db.add(row)
    await db.commit()
    log.info("user %s generated an SSH key (%s)", user.username, fingerprint)
    return SshKeyOut.model_validate(row)


@router.delete("/me/ssh-key", status_code=204)
async def delete_ssh_key(user: SessionUserDep, db: DbDep):
    row = await db.get(UserSshKey, user.id)
    if row is None:
        raise NotFoundError("You have no SSH key")
    in_use = (
        await db.execute(
            select(func.count())
            .select_from(LedgerRemote)
            .where(LedgerRemote.ssh_user_id == user.id, LedgerRemote.auth == "ssh_key")
        )
    ).scalar_one()
    if in_use:
        raise ConflictError(
            f"{in_use} ledger remote(s) push with this key; disconnect or reconnect them first"
        )
    await db.delete(row)
    await db.commit()
    log.info("user %s removed their SSH key", user.username)
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
    stars = (
        await db.execute(
            select(func.count()).select_from(LedgerStar).where(LedgerStar.user_id == user.id)
        )
    ).scalar_one()
    return {
        "profile": PublicUserOut.model_validate(user).model_dump(by_alias=True),
        "starredCount": stars,
        "isSelf": auth.user is not None and auth.user.id == user.id,
    }
