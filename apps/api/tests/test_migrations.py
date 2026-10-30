from __future__ import annotations

import uuid
from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.config import get_settings
from app.db import models  # noqa: F401  (registers every table on Base.metadata)
from app.db.base import BASELINE_REVISION, Base, alembic_config, get_session_factory, upgrade_schema
from app.storage import Storage


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


async def _scalar(engine: AsyncEngine, sql: str, **params):
    async with engine.connect() as conn:
        return (await conn.execute(sa.text(sql), params)).scalar_one()


async def _rows(engine: AsyncEngine, sql: str, **params) -> list:
    async with engine.connect() as conn:
        return (await conn.execute(sa.text(sql), params)).all()


def _engine(tmp_path: Path, name: str) -> AsyncEngine:
    return create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / name).as_posix()}")


async def _upgrade_to(engine: AsyncEngine, revision: str) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync: command.upgrade(alembic_config(sync), revision))


_USER_SQL = (
    "INSERT INTO users (id, email, username, password_hash, display_name, bio, website, location,"
    " is_admin, preferences, created_at, updated_at) VALUES"
    " (:id, :email, :username, 'x', :display_name, '', '', '', 0, '{}', '2026-01-01', '2026-01-01')"
)
_LEDGER_SQL = (
    "INSERT INTO ledgers (id, owner_id, slug, title, description, visibility, main_file,"
    " stars_count, created_at, updated_at) VALUES"
    " (:id, :owner_id, :slug, :title, '', 'private', 'main.bean', 0, '2026-01-01', '2026-01-01')"
)


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
    await _upgrade_to(engine, BASELINE_REVISION)
    async with engine.begin() as conn:
        # As left by the create_all() path that predated migrations: tables, no version row.
        await conn.execute(sa.text("DROP TABLE alembic_version"))
        await conn.execute(
            sa.text(_USER_SQL),
            {"id": "u1", "email": "a@example.com", "username": "ada", "display_name": "Ada"},
        )
    async with engine.begin() as conn:
        await conn.run_sync(upgrade_schema)
    assert await _version(engine) == _head()
    assert await _scalar(engine, "SELECT count(*) FROM users") == 1
    assert await _rows(engine, "SELECT slug, name FROM workspaces") == [("ada", "Ada")]
    assert await _drift(engine) == []
    await engine.dispose()


async def test_upgrade_is_idempotent(tmp_path: Path):
    engine = _engine(tmp_path, "twice.db")
    for _ in range(2):
        async with engine.begin() as conn:
            await conn.run_sync(upgrade_schema)
    assert await _version(engine) == _head()
    await engine.dispose()


async def test_workspace_migration_moves_people_ledgers_and_files(tmp_path: Path):
    """Revision 0004 on a populated 0003 database, as an upgrade of a running instance."""
    engine = _engine(tmp_path, "v3.db")
    await _upgrade_to(engine, "0003")
    tag = uuid.uuid4().hex[:8]
    ada, bob = f"ada{tag}", f"bob{tag}"
    books_ada, books_bob = f"la{tag}", f"lb{tag}"
    async with engine.begin() as conn:
        for user_id, name in ((ada, "Ada"), (bob, "")):
            await conn.execute(
                sa.text(_USER_SQL),
                {
                    "id": user_id,
                    "email": f"{user_id}@example.com",
                    "username": user_id,
                    "display_name": name,
                },
            )
        # The same slug under two owners, which stays legal once each owner is a workspace.
        for ledger_id, owner in ((books_ada, ada), (books_bob, bob)):
            await conn.execute(
                sa.text(_LEDGER_SQL),
                {"id": ledger_id, "owner_id": owner, "slug": "books", "title": "Books"},
            )
        await conn.execute(
            sa.text(
                "INSERT INTO ledger_collaborators (ledger_id, user_id, role, created_at)"
                " VALUES (:ledger, :user, 'write', '2026-01-01')"
            ),
            {"ledger": books_ada, "user": bob},
        )
        await conn.execute(
            sa.text(
                "INSERT INTO ledger_remotes (ledger_id, url, transport, auth, token_ciphertext,"
                " branch, state, last_pushed_sha, last_synced_at, last_error, created_at,"
                " updated_at) VALUES (:ledger, 'git@github.com:ada/books.git', 'ssh', 'ssh_key',"
                " NULL, 'main', 'in_sync', NULL, NULL, '', '2026-01-01', '2026-01-01')"
            ),
            {"ledger": books_ada},
        )
        # Rows that reference ledgers must survive the table rebuild.
        await conn.execute(
            sa.text(
                "INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash, scopes, ledger_id,"
                " expires_at, revoked_at, last_used_at, created_at) VALUES"
                " (:id, :user, 'ci', 'bsk_x', :hash, '[\"read\"]', :ledger, NULL, NULL, NULL,"
                " '2026-01-01')"
            ),
            {"id": f"k{tag}", "user": ada, "hash": f"h{tag}", "ledger": books_ada},
        )
        await conn.execute(
            sa.text(
                "INSERT INTO chat_threads (id, ledger_id, user_id, title, messages, created_at,"
                " updated_at) VALUES (:id, :ledger, :user, 't', '[]', '2026-01-01', '2026-01-01')"
            ),
            {"id": f"t{tag}", "ledger": books_ada, "user": ada},
        )
        await conn.execute(
            sa.text(
                "INSERT INTO ledger_stars (user_id, ledger_id, created_at)"
                " VALUES (:user, :ledger, '2026-01-01')"
            ),
            {"user": bob, "ledger": books_ada},
        )
    storage = Storage(get_settings().data_dir)
    for ledger_id in (books_ada, books_bob):
        legacy_repo = storage.root / "ledgers" / ledger_id / "repo"
        legacy_repo.mkdir(parents=True)
        (legacy_repo / "main.bean").write_text(f"; {ledger_id}\n")

    async with engine.begin() as conn:
        await conn.run_sync(upgrade_schema)

    assert await _version(engine) == _head()
    assert await _drift(engine) == []
    assert "ledger_collaborators" not in await _tables(engine)
    workspaces = dict(await _rows(engine, "SELECT slug, id FROM workspaces"))
    assert set(workspaces) == {ada, bob}
    assert await _rows(engine, "SELECT name FROM workspaces WHERE slug = :slug", slug=bob) == [
        (bob,)
    ]
    members = await _rows(
        engine, "SELECT workspace_id, user_id, role FROM workspace_members ORDER BY user_id"
    )
    assert members == [(workspaces[ada], ada, "owner"), (workspaces[bob], bob, "owner")]
    placed = dict(await _rows(engine, "SELECT id, workspace_id FROM ledgers"))
    assert placed == {books_ada: workspaces[ada], books_bob: workspaces[bob]}
    assert (
        await _scalar(
            engine, "SELECT ssh_user_id FROM ledger_remotes WHERE ledger_id = :id", id=books_ada
        )
        == ada
    )
    for table in ("api_keys", "chat_threads", "ledger_stars", "ledger_remotes"):
        assert await _scalar(engine, f"SELECT count(*) FROM {table}") == 1, table

    for ledger_id, owner in ((books_ada, ada), (books_bob, bob)):
        moved = storage.ledger_paths(workspaces[owner], ledger_id).main_file
        assert moved.read_text() == f"; {ledger_id}\n"
        assert not (storage.root / "ledgers" / ledger_id).exists()
    await engine.dispose()


async def test_sessions_enforce_foreign_keys(client: AsyncClient):
    """Cascades and SET NULL only happen on SQLite when every connection opts in."""
    async with get_session_factory()() as db:
        assert (await db.execute(sa.text("PRAGMA foreign_keys"))).scalar_one() == 1
