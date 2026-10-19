"""Async SQLAlchemy engine, session factory and schema migrations."""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings
from app.logging_setup import get_logger
from app.storage import get_storage

log = get_logger(__name__)

# Revision that describes the schema as it was before Alembic; databases created with the old
# create_all() path are stamped with it so later migrations apply cleanly.
BASELINE_REVISION = "0001"
MIGRATIONS_DIR = Path(__file__).parent / "migrations"


class Base(DeclarativeBase):
    pass


_engine = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine():
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(settings.resolved_database_url, future=True)
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _session_factory


async def get_db() -> AsyncIterator[AsyncSession]:
    async with get_session_factory()() as session:
        yield session


def alembic_config(connection: Connection | None = None) -> Config:
    """Alembic configuration pointing at the bundled migrations; `connection` is shared with env.py."""
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    if connection is not None:
        config.attributes["connection"] = connection
    return config


def upgrade_schema(connection: Connection) -> None:
    """Bring the schema to the latest revision. Runs on a synchronous connection via run_sync()."""
    from app.db import models  # noqa: F401  (registers every table on Base.metadata)

    config = alembic_config(connection)
    tables = set(sa.inspect(connection).get_table_names())
    if "alembic_version" not in tables and "users" in tables:
        log.warning("database predates migrations; recording it as revision %s", BASELINE_REVISION)
        command.stamp(config, BASELINE_REVISION)
    command.upgrade(config, "head")
    drift = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    if drift:
        log.error("database schema differs from the models after migration: %s", drift)


async def init_db() -> None:
    """Prepare the storage tree and migrate the database to the latest revision."""
    get_storage().ensure_layout()
    engine = get_engine()
    async with engine.begin() as conn:
        if engine.dialect.name == "sqlite":
            await conn.exec_driver_sql("PRAGMA journal_mode=WAL")
            await conn.exec_driver_sql("PRAGMA foreign_keys=ON")
        await conn.run_sync(upgrade_schema)


async def dispose_db() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None
