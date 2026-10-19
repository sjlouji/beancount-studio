"""desktop sign-ins

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-19 16:17:31.867337
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "desktop_sign_ins",
        sa.Column("challenge", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("challenge"),
    )
    with op.batch_alter_table("desktop_sign_ins", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_desktop_sign_ins_user_id"), ["user_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("desktop_sign_ins", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_desktop_sign_ins_user_id"))

    op.drop_table("desktop_sign_ins")
