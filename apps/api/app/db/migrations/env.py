"""Alembic environment.

Two ways in: the application shares a live connection through `config.attributes["connection"]`
at startup (see app/db/base.py), and the developer CLI (`uv run alembic ...`) opens its own
async engine from the application settings.
"""

from __future__ import annotations

import asyncio

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import get_settings
from app.db import models  # noqa: F401  (registers every table on Base.metadata)
from app.db.base import Base
from app.db.models import UtcDateTime

config = context.config
target_metadata = Base.metadata


def render_item(type_: str, obj: object, autogen_context) -> str | bool:
    """Render UtcDateTime as the SQLAlchemy type it wraps, so migrations never import app code."""
    if type_ == "type" and isinstance(obj, UtcDateTime):
        return "sa.DateTime(timezone=True)"
    return False


def _configure(**kwargs) -> None:
    context.configure(
        target_metadata=target_metadata,
        render_as_batch=True,  # SQLite cannot ALTER in place; a no-op on PostgreSQL
        compare_type=True,
        render_item=render_item,
        **kwargs,
    )


def run_migrations_offline() -> None:
    _configure(url=get_settings().resolved_database_url, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    _configure(connection=connection)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    engine = create_async_engine(get_settings().resolved_database_url, poolclass=pool.NullPool)
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        do_run_migrations(connection)
    else:
        asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
