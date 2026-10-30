"""workspaces: the tenant that owns ledgers and members

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-30 10:00:00.000000

Every existing person gets a workspace named after them (slug = username) holding the ledgers
they owned, as the owner. Per-ledger collaborator grants are not carried over: a workspace
member sees every ledger in it, so copying a grant for one ledger would widen access to the
rest. The grants that went are logged so the owner can invite those people back.

Ledger directories move from <data>/ledgers/<id> to <data>/workspaces/<ws>/ledgers/<id>.
"""

from __future__ import annotations

import logging
import shutil
import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

from app.config import get_settings
from app.storage import Storage

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")

_DATETIME = sa.DateTime(timezone=True)
workspaces = sa.table(
    "workspaces",
    sa.column("id", sa.String),
    sa.column("slug", sa.String),
    sa.column("name", sa.String),
    sa.column("created_at", _DATETIME),
    sa.column("updated_at", _DATETIME),
)
workspace_members = sa.table(
    "workspace_members",
    sa.column("workspace_id", sa.String),
    sa.column("user_id", sa.String),
    sa.column("role", sa.String),
    sa.column("created_at", _DATETIME),
)


def _legacy_ledger_dir(storage: Storage, ledger_id: str):
    """Where a ledger lived before workspaces: <data>/ledgers/<id>."""
    return storage.root / "ledgers" / ledger_id


def upgrade() -> None:
    bind = op.get_bind()

    op.create_table(
        "workspaces",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("slug", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("workspaces", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_workspaces_slug"), ["slug"], unique=True)

    op.create_table(
        "workspace_members",
        sa.Column("workspace_id", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.String(length=32), nullable=False),
        sa.Column("role", sa.String(length=10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("workspace_id", "user_id"),
    )
    with op.batch_alter_table("workspace_members", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_workspace_members_user_id"), ["user_id"], unique=False)

    op.create_table(
        "workspace_invites",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("workspace_id", sa.String(length=32), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("role", sa.String(length=10), nullable=False),
        sa.Column("created_by_id", sa.String(length=32), nullable=True),
        sa.Column("uses", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("workspace_invites", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_workspace_invites_token_hash"), ["token_hash"], unique=True
        )
        batch_op.create_index(
            batch_op.f("ix_workspace_invites_workspace_id"), ["workspace_id"], unique=False
        )

    # Table-level constraints: SQLite's reflection cannot read ON DELETE back from a
    # column-level REFERENCES clause, which would make the schema look drifted forever.
    with op.batch_alter_table("ledgers", schema=None) as batch_op:
        batch_op.add_column(sa.Column("workspace_id", sa.String(length=32), nullable=True))
        batch_op.create_foreign_key(
            "fk_ledgers_workspace_id_workspaces",
            "workspaces",
            ["workspace_id"],
            ["id"],
            ondelete="CASCADE",
        )
    with op.batch_alter_table("ledger_remotes", schema=None) as batch_op:
        batch_op.add_column(sa.Column("ssh_user_id", sa.String(length=32), nullable=True))
        batch_op.create_foreign_key(
            "fk_ledger_remotes_ssh_user_id_users",
            "users",
            ["ssh_user_id"],
            ["id"],
            ondelete="SET NULL",
        )

    _move_people_into_their_own_workspaces(bind)
    _report_dropped_collaborators(bind)

    with op.batch_alter_table("ledgers", schema=None) as batch_op:
        batch_op.alter_column("workspace_id", existing_type=sa.String(length=32), nullable=False)
        batch_op.drop_constraint("uq_ledger_owner_slug", type_="unique")
        batch_op.drop_index(batch_op.f("ix_ledgers_owner_id"))
        batch_op.drop_column("owner_id")
        batch_op.create_unique_constraint("uq_ledger_workspace_slug", ["workspace_id", "slug"])
        batch_op.create_index(batch_op.f("ix_ledgers_workspace_id"), ["workspace_id"], unique=False)

    op.drop_table("ledger_collaborators")

    _relocate_ledger_directories(bind)


def _move_people_into_their_own_workspaces(bind: sa.Connection) -> None:
    now = datetime.now(UTC)
    users = bind.execute(sa.text("SELECT id, username, display_name FROM users")).all()
    for user_id, username, display_name in users:
        workspace_id = uuid.uuid4().hex
        bind.execute(
            workspaces.insert().values(
                id=workspace_id,
                slug=username,
                name=display_name or username,
                created_at=now,
                updated_at=now,
            )
        )
        bind.execute(
            workspace_members.insert().values(
                workspace_id=workspace_id, user_id=user_id, role="owner", created_at=now
            )
        )
        bind.execute(
            sa.text("UPDATE ledgers SET workspace_id = :workspace_id WHERE owner_id = :user_id"),
            {"workspace_id": workspace_id, "user_id": user_id},
        )
    # Pushes used the owner's key; keep using it.
    bind.execute(
        sa.text(
            "UPDATE ledger_remotes SET ssh_user_id = "
            "(SELECT owner_id FROM ledgers WHERE ledgers.id = ledger_remotes.ledger_id) "
            "WHERE auth = 'ssh_key'"
        )
    )
    if users:
        log.warning("created a personal workspace for each of %d account(s)", len(users))


def _report_dropped_collaborators(bind: sa.Connection) -> None:
    grants = bind.execute(
        sa.text(
            "SELECT u.username, o.username, l.slug, c.role FROM ledger_collaborators c "
            "JOIN users u ON u.id = c.user_id "
            "JOIN ledgers l ON l.id = c.ledger_id "
            "JOIN users o ON o.id = l.owner_id"
        )
    ).all()
    if grants:
        listed = ", ".join(
            f"{person} ({role} on {owner}/{slug})" for person, owner, slug, role in grants
        )
        log.warning(
            "%d per-ledger collaborator grant(s) are not carried over to workspaces; "
            "invite these people into the workspace instead: %s",
            len(grants),
            listed,
        )


def _relocate_ledger_directories(bind: sa.Connection) -> None:
    storage = Storage(get_settings().data_dir)
    rows = bind.execute(sa.text("SELECT id, workspace_id FROM ledgers")).all()
    moved = 0
    for ledger_id, workspace_id in rows:
        source = _legacy_ledger_dir(storage, ledger_id)
        target = storage.ledger_paths(workspace_id, ledger_id).root
        if target.exists() or not source.exists():
            continue  # already moved, or a row whose files were never on this disk
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(target))
        moved += 1
    legacy_root = storage.root / "ledgers"
    if legacy_root.is_dir() and not any(legacy_root.iterdir()):
        legacy_root.rmdir()
    if moved:
        log.warning("moved %d ledger director(ies) under their workspace", moved)


def downgrade() -> None:
    bind = op.get_bind()
    storage = Storage(get_settings().data_dir)

    # Files first, while the rows still say which workspace a ledger is in.
    for ledger_id, workspace_id in bind.execute(
        sa.text("SELECT id, workspace_id FROM ledgers")
    ).all():
        source = storage.ledger_paths(workspace_id, ledger_id).root
        target = _legacy_ledger_dir(storage, ledger_id)
        if source.exists() and not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source), str(target))

    op.create_table(
        "ledger_collaborators",
        sa.Column("ledger_id", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.String(length=32), nullable=False),
        sa.Column("role", sa.String(length=10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["ledger_id"], ["ledgers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("ledger_id", "user_id"),
    )
    with op.batch_alter_table("ledgers", schema=None) as batch_op:
        batch_op.add_column(sa.Column("owner_id", sa.String(length=32), nullable=True))
        batch_op.create_foreign_key(
            "fk_ledgers_owner_id_users", "users", ["owner_id"], ["id"], ondelete="CASCADE"
        )
    # The ledger goes back to one of the workspace's owners; the rest lose access.
    bind.execute(
        sa.text(
            "UPDATE ledgers SET owner_id = (SELECT MIN(user_id) FROM workspace_members m "
            "WHERE m.workspace_id = ledgers.workspace_id AND m.role = 'owner')"
        )
    )
    with op.batch_alter_table("ledgers", schema=None) as batch_op:
        batch_op.alter_column("owner_id", existing_type=sa.String(length=32), nullable=False)
        batch_op.drop_index(batch_op.f("ix_ledgers_workspace_id"))
        batch_op.drop_constraint("uq_ledger_workspace_slug", type_="unique")
        batch_op.drop_column("workspace_id")
        batch_op.create_unique_constraint("uq_ledger_owner_slug", ["owner_id", "slug"])
        batch_op.create_index(batch_op.f("ix_ledgers_owner_id"), ["owner_id"], unique=False)
    with op.batch_alter_table("ledger_remotes", schema=None) as batch_op:
        batch_op.drop_column("ssh_user_id")

    with op.batch_alter_table("workspace_invites", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_workspace_invites_workspace_id"))
        batch_op.drop_index(batch_op.f("ix_workspace_invites_token_hash"))
    op.drop_table("workspace_invites")
    with op.batch_alter_table("workspace_members", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_workspace_members_user_id"))
    op.drop_table("workspace_members")
    with op.batch_alter_table("workspaces", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_workspaces_slug"))
    op.drop_table("workspaces")
