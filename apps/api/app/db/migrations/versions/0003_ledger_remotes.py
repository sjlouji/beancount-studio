"""ledger remotes and user ssh keys

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-20 13:40:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ledger_remotes",
        sa.Column("ledger_id", sa.String(length=32), nullable=False),
        sa.Column("url", sa.String(length=512), nullable=False),
        sa.Column("transport", sa.String(length=8), nullable=False),
        sa.Column("auth", sa.String(length=8), nullable=False),
        sa.Column("token_ciphertext", sa.Text(), nullable=True),
        sa.Column("branch", sa.String(length=120), nullable=False),
        sa.Column("state", sa.String(length=12), nullable=False),
        sa.Column("last_pushed_sha", sa.String(length=40), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["ledger_id"], ["ledgers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("ledger_id"),
    )
    op.create_table(
        "user_ssh_keys",
        sa.Column("user_id", sa.String(length=32), nullable=False),
        sa.Column("public_key", sa.Text(), nullable=False),
        sa.Column("private_key_ciphertext", sa.Text(), nullable=False),
        sa.Column("fingerprint", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("user_ssh_keys")
    op.drop_table("ledger_remotes")
