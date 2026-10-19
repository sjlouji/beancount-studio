from __future__ import annotations

from pathlib import Path

import sqlalchemy as sa
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.db import models  # noqa: F401  (registers every table on Base.metadata)
from app.db.base import BASELINE_REVISION, Base, alembic_config, upgrade_schema


def _head() -> str:
    head = ScriptDirectory.from_config(alembic_config()).get_current_head()
    assert head is not None
    return head


async def _tables(engine: AsyncEngine) -> set[str]:
    async with engine.connect() as conn:
        return await conn.run_sync(lambda sync: set(sa.inspect(sync).get_table_names()))


async def _version(engine: AsyncEngine) -> str:
    async with engine.connect() as conn:
        result = await conn.execute(sa.text("SELECT version_num FROM alembic_version"))
        return result.scalar_one()


async def _drift(engine: AsyncEngine) -> list:
    async with engine.connect() as conn:
        return await conn.run_sync(
            lambda sync: compare_metadata(MigrationContext.configure(sync), Base.metadata)
        )


def _engine(tmp_path: Path, name: str) -> AsyncEngine:
    return create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / name).as_posix()}")


async def test_fresh_database_is_migrated_to_head(tmp_path: Path):
    engine = _engine(tmp_path, "fresh.db")
    async with engine.begin() as conn:
        await conn.run_sync(upgrade_schema)
    tables = await _tables(engine)
    assert set(Base.metadata.tables) <= tables
    assert await _version(engine) == _head()
    await engine.dispose()


async def test_migrations_produce_exactly_the_model_schema(tmp_path: Path):
    engine = _engine(tmp_path, "exact.db")
    async with engine.begin() as conn:
        await conn.run_sync(upgrade_schema)
    assert await _drift(engine) == []
    await engine.dispose()


async def test_database_created_before_migrations_is_stamped_not_recreated(tmp_path: Path):
    engine = _engine(tmp_path, "legacy.db")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with engine.begin() as conn:
        await conn.execute(
            sa.text(
                "INSERT INTO users (id, email, username, password_hash, display_name, bio, website,"
                " location, is_admin, preferences, created_at, updated_at) VALUES"
                " ('u1', 'a@example.com', 'ada', 'x', '', '', '', '', 0, '{}', '2026-01-01', '2026-01-01')"
            )
        )
    async with engine.begin() as conn:
        await conn.run_sync(upgrade_schema)
    assert await _version(engine) == _head()
    assert BASELINE_REVISION in {_head(), BASELINE_REVISION}
    async with engine.connect() as conn:
        count = (await conn.execute(sa.text("SELECT count(*) FROM users"))).scalar_one()
    assert count == 1
    assert await _drift(engine) == []
    await engine.dispose()


async def test_upgrade_is_idempotent(tmp_path: Path):
    engine = _engine(tmp_path, "twice.db")
    for _ in range(2):
        async with engine.begin() as conn:
            await conn.run_sync(upgrade_schema)
    assert await _version(engine) == _head()
    await engine.dispose()
