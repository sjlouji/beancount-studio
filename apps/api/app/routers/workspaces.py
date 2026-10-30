"""Workspaces: the tenant. Create, rename and delete them; manage members and invite links."""

from __future__ import annotations

from datetime import UTC, timedelta

from fastapi import APIRouter, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import (
    WORKSPACE_ROLE_RANK,
    AuthDep,
    DbDep,
    SessionUserDep,
    SettingsDep,
    UserDep,
    WorkspaceAccess,
    WorkspaceAdminDep,
    WorkspaceDep,
    WorkspaceOwnerDep,
    find_membership,
    find_workspace,
)
from app.core.security import hash_token, new_token
from app.db.models import Ledger, User, Workspace, WorkspaceInvite, WorkspaceMember, utcnow
from app.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.ledgers.store import get_store
from app.logging_setup import get_logger
from app.schemas import (
    InviteCreateRequest,
    InviteOut,
    InvitePreviewOut,
    MemberOut,
    MemberRoleRequest,
    MintedInviteOut,
    WorkspaceCreateRequest,
    WorkspaceOut,
    WorkspaceUpdateRequest,
    slugify,
    valid_workspace_slug,
)

log = get_logger(__name__)
router = APIRouter(prefix="/workspaces", tags=["workspaces"])
invite_router = APIRouter(prefix="/invites", tags=["workspaces"])


async def workspace_out(db: AsyncSession, workspace: Workspace, role: str) -> WorkspaceOut:
    members = (
        await db.execute(
            select(func.count())
            .select_from(WorkspaceMember)
            .where(WorkspaceMember.workspace_id == workspace.id)
        )
    ).scalar_one()
    ledgers = (
        await db.execute(
            select(func.count()).select_from(Ledger).where(Ledger.workspace_id == workspace.id)
        )
    ).scalar_one()
    return WorkspaceOut(
        id=workspace.id,
        slug=workspace.slug,
        name=workspace.name,
        role=role,
        members_count=members,
        ledgers_count=ledgers,
        created_at=workspace.created_at,
        updated_at=workspace.updated_at,
    )


def _member_out(member: WorkspaceMember, user: User) -> MemberOut:
    return MemberOut(
        username=user.username,
        display_name=user.display_name,
        role=member.role,
        joined_at=member.created_at,
    )


def _invite_out(invite: WorkspaceInvite, created_by: User | None) -> InviteOut:
    return InviteOut(
        id=invite.id,
        role=invite.role,
        uses=invite.uses,
        created_by=created_by.username if created_by else None,
        expires_at=invite.expires_at,
        created_at=invite.created_at,
    )


def _invite_is_live(invite: WorkspaceInvite) -> bool:
    expires = (
        invite.expires_at if invite.expires_at.tzinfo else invite.expires_at.replace(tzinfo=UTC)
    )
    return invite.revoked_at is None and expires > utcnow()


# ------------------------------------------------------------------ workspaces


@router.get("", response_model=list[WorkspaceOut])
async def list_my_workspaces(user: UserDep, db: DbDep, auth: AuthDep):
    if auth.kind == "api_key" and auth.api_key_ledger_id:
        raise ForbiddenError("This API key is limited to one ledger")
    rows = (
        await db.execute(
            select(Workspace, WorkspaceMember.role)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
            .where(WorkspaceMember.user_id == user.id)
            .order_by(Workspace.name)
        )
    ).all()
    return [await workspace_out(db, workspace, role) for workspace, role in rows]


@router.post("", response_model=WorkspaceOut, status_code=201)
async def create_workspace(body: WorkspaceCreateRequest, user: UserDep, db: DbDep, auth: AuthDep):
    if not auth.can_write_scope:
        raise ForbiddenError("This API key is read-only")
    slug = body.slug or slugify(body.name, 40)
    if not valid_workspace_slug(slug):
        raise ValidationError("Choose an address of 3-40 lowercase letters, digits or hyphens")
    if await find_workspace(db, slug) is not None:
        raise ConflictError(f"A workspace already lives at /{slug}")
    workspace = Workspace(name=body.name.strip(), slug=slug)
    db.add(workspace)
    await db.flush()
    db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role="owner"))
    await db.commit()
    log.info("workspace %s created by %s", slug, user.username)
    return await workspace_out(db, workspace, "owner")


@router.get("/{workspace}", response_model=WorkspaceOut)
async def get_workspace(access: WorkspaceDep, db: DbDep):
    return await workspace_out(db, access.workspace, access.role)


@router.patch("/{workspace}", response_model=WorkspaceOut)
async def update_workspace(body: WorkspaceUpdateRequest, access: WorkspaceAdminDep, db: DbDep):
    workspace = access.workspace
    if body.slug is not None and body.slug != workspace.slug:
        if await find_workspace(db, body.slug) is not None:
            raise ConflictError(f"A workspace already lives at /{body.slug}")
        workspace.slug = body.slug
    if body.name is not None:
        workspace.name = body.name.strip()
    await db.commit()
    return await workspace_out(db, workspace, access.role)


@router.delete("/{workspace}", status_code=204)
async def delete_workspace(access: WorkspaceOwnerDep, db: DbDep):
    """Everything in the workspace goes: ledgers on disk, members, invites and ledger metadata."""
    workspace = access.workspace
    ledger_ids = (
        (await db.execute(select(Ledger.id).where(Ledger.workspace_id == workspace.id)))
        .scalars()
        .all()
    )
    await get_store().delete_workspace(workspace.id, ledger_ids)
    await db.delete(workspace)
    await db.commit()
    log.info("workspace %s deleted by %s", workspace.slug, access.user.username)
    return Response(status_code=204)


# --------------------------------------------------------------------- members


async def _member_rows(db: AsyncSession, workspace_id: str) -> list[tuple[WorkspaceMember, User]]:
    rows = await db.execute(
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(User.username)
    )
    return [(member, user) for member, user in rows.all()]


async def _target_member(
    db: AsyncSession, workspace: Workspace, username: str
) -> tuple[WorkspaceMember, User]:
    user = (
        await db.execute(select(User).where(User.username == username.lower()))
    ).scalar_one_or_none()
    member = await find_membership(db, workspace.id, user.id) if user else None
    if user is None or member is None:
        raise NotFoundError("That person is not a member of this workspace")
    return member, user


async def _owners_count(db: AsyncSession, workspace_id: str) -> int:
    return (
        await db.execute(
            select(func.count())
            .select_from(WorkspaceMember)
            .where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.role == "owner")
        )
    ).scalar_one()


def _require_outranks(actor: WorkspaceAccess, target: WorkspaceMember) -> None:
    """Only someone above a member may change or remove them; owners are peers of each other."""
    if actor.rank <= WORKSPACE_ROLE_RANK[target.role]:
        raise ForbiddenError(f"You cannot change a {target.role} of this workspace")


@router.get("/{workspace}/members", response_model=list[MemberOut])
async def list_members(access: WorkspaceDep, db: DbDep):
    return [
        _member_out(member, user) for member, user in await _member_rows(db, access.workspace.id)
    ]


@router.patch("/{workspace}/members/{username}", response_model=MemberOut)
async def set_member_role(
    username: str, body: MemberRoleRequest, access: WorkspaceAdminDep, db: DbDep
):
    member, user = await _target_member(db, access.workspace, username)
    if user.id == access.user.id:
        raise ValidationError("You cannot change your own role; ask another owner or admin")
    _require_outranks(access, member)
    if WORKSPACE_ROLE_RANK[body.role] > access.rank:
        raise ForbiddenError(f"Only an owner can make someone {body.role}")
    member.role = body.role
    await db.commit()
    log.info(
        "%s is now %s of workspace %s (by %s)",
        user.username,
        body.role,
        access.workspace.slug,
        access.user.username,
    )
    return _member_out(member, user)


@router.delete("/{workspace}/members/{username}", status_code=204)
async def remove_member(username: str, access: WorkspaceDep, db: DbDep):
    """Admins remove people below them; anyone may leave, except the last owner."""
    member, user = await _target_member(db, access.workspace, username)
    leaving = user.id == access.user.id
    if not leaving:
        if not access.can_admin:
            raise ForbiddenError("You need admin access to remove members")
        _require_outranks(access, member)
    if member.role == "owner" and await _owners_count(db, access.workspace.id) == 1:
        raise ConflictError(
            "This workspace needs an owner. Make someone else an owner first, or delete it."
        )
    await db.delete(member)
    await db.commit()
    log.info(
        "%s %s workspace %s",
        user.username,
        "left" if leaving else f"was removed from (by {access.user.username})",
        access.workspace.slug,
    )
    return Response(status_code=204)


# --------------------------------------------------------------------- invites


@router.get("/{workspace}/invites", response_model=list[InviteOut])
async def list_invites(access: WorkspaceAdminDep, db: DbDep):
    rows = (
        await db.execute(
            select(WorkspaceInvite, User)
            .outerjoin(User, User.id == WorkspaceInvite.created_by_id)
            .where(WorkspaceInvite.workspace_id == access.workspace.id)
            .order_by(WorkspaceInvite.created_at.desc())
        )
    ).all()
    return [_invite_out(invite, creator) for invite, creator in rows if _invite_is_live(invite)]


@router.post("/{workspace}/invites", response_model=MintedInviteOut, status_code=201)
async def create_invite(
    body: InviteCreateRequest,
    access: WorkspaceAdminDep,
    user: SessionUserDep,
    db: DbDep,
    settings: SettingsDep,
):
    if WORKSPACE_ROLE_RANK[body.role] > access.rank:
        raise ForbiddenError(f"You cannot invite people as {body.role}")
    token = new_token()
    invite = WorkspaceInvite(
        workspace_id=access.workspace.id,
        token_hash=hash_token(token),
        role=body.role,
        created_by_id=user.id,
        expires_at=utcnow() + timedelta(days=body.expires_in_days),
    )
    db.add(invite)
    await db.commit()
    log.info("invite link for workspace %s created by %s", access.workspace.slug, user.username)
    out = _invite_out(invite, user).model_dump(by_alias=True)
    return MintedInviteOut(**out, url=f"{settings.public_url.rstrip('/')}/invite/{token}")


@router.delete("/{workspace}/invites/{invite_id}", status_code=204)
async def revoke_invite(invite_id: str, access: WorkspaceAdminDep, user: SessionUserDep, db: DbDep):
    invite = await db.get(WorkspaceInvite, invite_id)
    if invite is None or invite.workspace_id != access.workspace.id:
        raise NotFoundError("Invite not found")
    if invite.revoked_at is None:
        invite.revoked_at = utcnow()
        await db.commit()
        log.info(
            "invite %s to workspace %s revoked by %s",
            invite.id,
            access.workspace.slug,
            user.username,
        )
    return Response(status_code=204)


async def _live_invite(db: AsyncSession, token: str) -> WorkspaceInvite:
    invite = (
        await db.execute(
            select(WorkspaceInvite).where(WorkspaceInvite.token_hash == hash_token(token))
        )
    ).scalar_one_or_none()
    if invite is None or invite.revoked_at is not None:
        raise NotFoundError("This invite link is not valid")
    if not _invite_is_live(invite):
        raise NotFoundError("This invite link has expired")
    return invite


@invite_router.get("/{token}", response_model=InvitePreviewOut)
async def preview_invite(token: str, db: DbDep, auth: AuthDep):
    """What the link offers, shown before signing in or accepting. The link itself is the secret."""
    invite = await _live_invite(db, token)
    workspace = await db.get(Workspace, invite.workspace_id)
    creator = await db.get(User, invite.created_by_id) if invite.created_by_id else None
    assert workspace is not None  # the invite row cascades with its workspace
    already = (
        auth.user is not None and await find_membership(db, workspace.id, auth.user.id) is not None
    )
    return InvitePreviewOut(
        workspace_slug=workspace.slug,
        workspace_name=workspace.name,
        role=invite.role,
        invited_by=(creator.display_name or creator.username) if creator else None,
        expires_at=invite.expires_at,
        already_member=already,
    )


@invite_router.post("/{token}/accept", response_model=WorkspaceOut)
async def accept_invite(token: str, user: SessionUserDep, db: DbDep):
    """Join with the link's role. Already a member? Nothing changes, the current role stays."""
    invite = await _live_invite(db, token)
    workspace = await db.get(Workspace, invite.workspace_id)
    assert workspace is not None
    member = await find_membership(db, workspace.id, user.id)
    if member is None:
        member = WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=invite.role)
        db.add(member)
        invite.uses += 1
        await db.commit()
        log.info("%s joined workspace %s as %s", user.username, workspace.slug, invite.role)
    return await workspace_out(db, workspace, member.role)
