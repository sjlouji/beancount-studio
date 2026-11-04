"""chat thread pins: starred conversations list above the recent ones

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-04 16:45:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("chat_threads") as batch:
        batch.add_column(sa.Column("pinned_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("chat_threads") as batch:
        batch.drop_column("pinned_at")
