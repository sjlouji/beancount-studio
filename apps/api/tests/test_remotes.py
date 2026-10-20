from __future__ import annotations

import os
import shlex
import subprocess
import uuid
from pathlib import Path

import pytest
from httpx import AsyncClient

from app.config import get_settings
from app.core.security import (
    UndecryptableSecret,
    decrypt_secret,
    encrypt_secret,
    generate_ssh_keypair,
)
from app.db.base import get_session_factory
from app.db.models import Ledger, LedgerRemote, User, UserSshKey
from app.errors import ForbiddenError, ValidationError
from app.ledgers.remotes import (
    MainFileRequiredError,
    detect_main_file,
    get_remote_sync,
    parse_source,
)
from app.ledgers.store import get_store

_GIT_IDENTITY = ["-c", "user.name=Test", "-c", "user.email=test@example.com"]


def git(*args: str, cwd: Path) -> str:
    done = subprocess.run(
        ["git", *_GIT_IDENTITY, *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
        env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
    )
    return done.stdout.strip()


def head(cwd: Path) -> str:
    return git("rev-parse", "HEAD", cwd=cwd)


@pytest.fixture
def bare(tmp_path: Path) -> Path:
    path = tmp_path / "remote.git"
    git("init", "--bare", "-q", "-b", "main", str(path), cwd=tmp_path)
    return path


@pytest.fixture
def seed_repo(tmp_path: Path) -> Path:
    """A repository someone kept outside Studio: history, a main.bean and a second file."""
    path = tmp_path / "seed"
    path.mkdir()
    git("init", "-q", "-b", "trunk", cwd=path)
    (path / "main.bean").write_text('option "title" "Seed"\n2026-01-01 open Assets:Cash\n')
    (path / "README.md").write_text("# Seed\n")
    git("add", "-A", cwd=path)
    git("commit", "-q", "-m", "First", cwd=path)
    (path / "main.bean").write_text(
        'option "title" "Seed"\n2026-01-01 open Assets:Cash\n2026-01-01 open Expenses:Food\n'
    )
    git("commit", "-q", "-am", "Second", cwd=path)
    return path


@pytest.fixture
async def admin(user: dict) -> dict:
    """The fixture user, promoted: only the first account of a database is an administrator."""
    async with get_session_factory()() as db:
        row = await db.get(User, user["id"])
        assert row is not None
        row.is_admin = True
        await db.commit()
    return user


async def _rows(ledger: dict, user: dict) -> tuple[Ledger, User]:
    async with get_session_factory()() as db:
        row = await db.get(Ledger, ledger["id"])
        owner = await db.get(User, user["id"])
        assert row is not None and owner is not None
        return row, owner


async def _remote(ledger_id: str) -> LedgerRemote:
    async with get_session_factory()() as db:
        row = await db.get(LedgerRemote, ledger_id)
        assert row is not None
        return row


async def _connect(ledger: dict, user: dict, bare: Path) -> None:
    sync = get_remote_sync()
    async with get_session_factory()() as db:
        row = await db.get(Ledger, ledger["id"])
        owner = await db.get(User, user["id"])
        await sync.connect(db, row, owner, parse_source(str(bare)), "none")
    await sync.drain()


# ------------------------------------------------------------------ pure parts


def test_parse_source_accepts_the_supported_forms():
    assert parse_source("https://github.com/me/books.git").transport == "https"
    assert parse_source("git@github.com:me/books.git") == parse_source(
        "git@github.com:me/books.git"
    )
    assert parse_source("git@github.com:me/books.git").transport == "ssh"
    assert parse_source("ssh://git@gitlab.com/me/books.git").host == "gitlab.com"
    assert parse_source("file:///srv/books").transport == "local"
    assert parse_source("/srv/books").url == "/srv/books"


@pytest.mark.parametrize(
    "value",
    [
        "",
        "http://host/books.git",
        "https://user:token@github.com/me/books.git",
        "ftp://host/books",
        "relative/path",
        "https://github.com/me/books with space",
    ],
)
def test_parse_source_refuses_unsafe_or_unknown_forms(value: str):
    with pytest.raises(ValidationError):
        parse_source(value)


def test_secret_round_trip_and_wrong_key():
    sealed = encrypt_secret("ghp_example", "key-one")
    assert sealed != "ghp_example"
    assert decrypt_secret(sealed, "key-one") == "ghp_example"
    with pytest.raises(UndecryptableSecret):
        decrypt_secret(sealed, "key-two")


def test_detect_main_file_rules(tmp_path: Path):
    (tmp_path / "ledger.bean").write_text("")
    assert detect_main_file(tmp_path, None) == "ledger.bean"
    (tmp_path / "other.beancount").write_text("")
    with pytest.raises(MainFileRequiredError) as exc:
        detect_main_file(tmp_path, None)
    assert exc.value.details["candidates"] == ["ledger.bean", "other.beancount"]
    assert detect_main_file(tmp_path, "other.beancount") == "other.beancount"
    (tmp_path / "main.bean").write_text("")
    assert detect_main_file(tmp_path, None) == "main.bean"
    with pytest.raises(ValidationError):
        detect_main_file(tmp_path, "missing.bean")
    with pytest.raises(ValidationError):
        detect_main_file(tmp_path, "../escape.bean")


# ------------------------------------------------------------- policy checks


async def test_server_paths_are_for_administrators_outside_the_data_dir(
    client: AsyncClient, admin: dict, ledger: dict, seed_repo: Path
):
    sync = get_remote_sync()
    row, owner = await _rows(ledger, admin)
    assert owner.is_admin
    sync.check_source(parse_source(str(seed_repo)), "none", owner)
    inside = get_store().paths(ledger["id"]).repo
    with pytest.raises(ForbiddenError):
        sync.check_source(parse_source(str(inside)), "none", owner)
    with pytest.raises(ValidationError):
        sync.check_source(parse_source("https://github.com/me/books.git"), "ssh_key", owner)
    with pytest.raises(ValidationError):
        sync.check_source(parse_source("git@github.com:me/books.git"), "token", owner)

    name = f"member{uuid.uuid4().hex[:8]}"
    res = await client.post(
        "/api/auth/sign-up",
        json={
            "email": f"{name}@example.com",
            "username": name,
            "password": "correct-horse-battery",
        },
    )
    assert res.status_code == 201, res.text
    async with get_session_factory()() as db:
        member = await db.get(User, res.json()["id"])
    with pytest.raises(ForbiddenError):
        sync.check_source(parse_source(str(seed_repo)), "none", member)


# ---------------------------------------------------------------- clone / push


async def test_clone_brings_history_and_detects_the_main_file(
    client: AsyncClient, admin: dict, seed_repo: Path
):
    sync = get_remote_sync()
    async with get_session_factory()() as db:
        owner = await db.get(User, admin["id"])
        row = Ledger(owner_id=owner.id, slug="imported", title="Imported")
        db.add(row)
        await db.flush()
        main_file = await sync.clone(db, row, owner, parse_source(str(seed_repo)), "none")
        row.main_file = main_file
        await db.commit()
    assert main_file == "main.bean"
    repo = get_store().paths(row.id).repo
    assert head(repo) == head(seed_repo)
    assert git("rev-list", "--count", "HEAD", cwd=repo) == "2"
    remote = await _remote(row.id)
    assert (remote.transport, remote.auth, remote.branch, remote.state) == (
        "local",
        "none",
        "trunk",
        "in_sync",
    )
    served = await client.get(f"/api/ledgers/{admin['username']}/imported")
    assert served.status_code == 200, served.text
    assert served.json()["lastCommit"]["subject"] == "Second"


async def test_every_write_is_pushed_to_the_remote(
    client: AsyncClient, admin: dict, ledger: dict, bare: Path
):
    await _connect(ledger, admin, bare)
    repo = get_store().paths(ledger["id"]).repo
    assert head(bare) == head(repo), "connecting pushes the existing history"

    res = await client.put(
        f"/api/ledgers/{ledger['owner']}/{ledger['slug']}/files/content",
        json={"path": "notes.md", "content": "pushed\n"},
    )
    assert res.status_code == 200, res.text
    await get_remote_sync().drain()
    assert head(bare) == head(repo)
    remote = await _remote(ledger["id"])
    assert remote.state == "in_sync" and remote.last_pushed_sha == head(repo)
    assert remote.last_error == ""


async def test_sync_pulls_commits_made_elsewhere(
    client: AsyncClient, admin: dict, ledger: dict, bare: Path, tmp_path: Path
):
    await _connect(ledger, admin, bare)
    work = tmp_path / "work"
    git("clone", "-q", str(bare), str(work), cwd=tmp_path)
    (work / "extra.bean").write_text("2026-02-01 open Assets:Wallet\n")
    git("add", "-A", cwd=work)
    git("commit", "-q", "-m", "Add wallet", cwd=work)
    git("push", "-q", "origin", "main", cwd=work)

    sync = get_remote_sync()
    async with get_session_factory()() as db:
        row = await db.get(Ledger, ledger["id"])
        remote = await sync.sync(db, row)
    repo = get_store().paths(ledger["id"]).repo
    assert remote.state == "in_sync", remote.last_error
    assert head(repo) == head(bare) == head(work)
    assert (repo / "extra.bean").exists()


async def test_sync_stops_on_conflicting_changes(
    client: AsyncClient, admin: dict, ledger: dict, bare: Path, tmp_path: Path
):
    await _connect(ledger, admin, bare)
    base = f"/api/ledgers/{ledger['owner']}/{ledger['slug']}"
    work = tmp_path / "work"
    git("clone", "-q", str(bare), str(work), cwd=tmp_path)
    (work / "README.md").write_text("# Changed on another machine\n")
    git("commit", "-q", "-am", "Readme elsewhere", cwd=work)
    git("push", "-q", "origin", "main", cwd=work)

    res = await client.put(
        f"{base}/files/content", json={"path": "README.md", "content": "# Changed in Studio\n"}
    )
    assert res.status_code == 200, res.text
    sync = get_remote_sync()
    await sync.drain()
    repo = get_store().paths(ledger["id"]).repo
    local_head = head(repo)
    remote = await _remote(ledger["id"])
    assert remote.state == "behind", remote.last_error

    async with get_session_factory()() as db:
        row = await db.get(Ledger, ledger["id"])
        remote = await sync.sync(db, row)
    assert remote.state == "diverged"
    assert "README.md" in remote.last_error
    assert head(repo) == local_head, "nothing was merged or rewritten"
    assert head(bare) == head(work), "nothing was pushed"
    assert (repo / "README.md").read_text() == "# Changed in Studio\n"

    # Later saves still commit locally but do not push while diverged.
    res = await client.put(f"{base}/files/content", json={"path": "notes.md", "content": "x\n"})
    assert res.status_code == 200, res.text
    await sync.drain()
    assert head(bare) == head(work)
    assert (await _remote(ledger["id"])).state == "diverged"


# ------------------------------------------------------------------- HTTP API


async def test_create_ledger_from_a_server_path_through_the_api(
    client: AsyncClient, admin: dict, seed_repo: Path
):
    res = await client.post(
        "/api/ledgers", json={"title": "Imported books", "source": {"url": str(seed_repo)}}
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["lastCommit"]["subject"] == "Second"
    assert body["remote"]["transport"] == "local"
    assert body["remote"]["auth"] == "none"
    assert body["remote"]["branch"] == "trunk"
    assert body["remote"]["state"] == "in_sync"
    meta = await client.get(f"/api/ledgers/{admin['username']}/imported-books/meta")
    assert meta.status_code == 200, meta.text
    listing = await client.get("/api/ledgers")
    assert any(item["remote"] for item in listing.json())


async def test_create_asks_which_file_is_the_main_ledger(
    client: AsyncClient, admin: dict, tmp_path: Path
):
    path = tmp_path / "two"
    path.mkdir()
    git("init", "-q", "-b", "main", cwd=path)
    (path / "books.bean").write_text('option "title" "Books"\n')
    (path / "archive.bean").write_text('option "title" "Archive"\n')
    git("add", "-A", cwd=path)
    git("commit", "-q", "-m", "Two files", cwd=path)

    res = await client.post("/api/ledgers", json={"title": "Two", "source": {"url": str(path)}})
    assert res.status_code == 409, res.text
    assert res.json()["error"]["code"] == "main_file_required"
    assert res.json()["error"]["details"]["candidates"] == ["archive.bean", "books.bean"]
    assert (await client.get(f"/api/ledgers/{admin['username']}/two")).status_code == 404

    res = await client.post(
        "/api/ledgers",
        json={"title": "Two", "source": {"url": str(path), "mainFile": "books.bean"}},
    )
    assert res.status_code == 201, res.text
    meta = await client.get(f"/api/ledgers/{admin['username']}/two/meta")
    assert meta.status_code == 200, meta.text


async def test_remote_endpoints_connect_sync_disconnect(
    client: AsyncClient, admin: dict, ledger: dict, bare: Path
):
    base = f"/api/ledgers/{ledger['owner']}/{ledger['slug']}"
    res = await client.put(f"{base}/remote", json={"url": str(bare), "auth": "none"})
    assert res.status_code == 200, res.text
    assert res.json()["state"] == "pushing"
    await get_remote_sync().drain()

    shown = await client.get(base)
    assert shown.json()["remote"]["state"] == "in_sync"
    assert shown.json()["remote"]["lastPushedSha"] == head(get_store().paths(ledger["id"]).repo)

    synced = await client.post(f"{base}/remote/sync")
    assert synced.status_code == 200, synced.text
    assert synced.json()["state"] == "in_sync"

    gone = await client.delete(f"{base}/remote")
    assert gone.status_code == 204
    assert (await client.get(base)).json()["remote"] is None
    assert (await client.delete(f"{base}/remote")).status_code == 404


async def test_connecting_needs_admin_role_and_sync_needs_write(
    client: AsyncClient, admin: dict, ledger: dict, bare: Path
):
    base = f"/api/ledgers/{ledger['owner']}/{ledger['slug']}"
    assert (
        await client.put(f"{base}/remote", json={"url": str(bare), "auth": "none"})
    ).status_code == 200
    await get_remote_sync().drain()

    name = f"writer{uuid.uuid4().hex[:8]}"
    res = await client.post(
        "/api/auth/sign-up",
        json={
            "email": f"{name}@example.com",
            "username": name,
            "password": "correct-horse-battery",
        },
    )
    assert res.status_code == 201, res.text
    # Signing up switched the session to the new account; the owner grants write access.
    assert (
        await client.post(
            "/api/auth/login",
            json={"identifier": admin["username"], "password": "correct-horse-battery"},
        )
    ).status_code == 200
    granted = await client.put(f"{base}/collaborators/{name}", json={"role": "write"})
    assert granted.status_code == 200, granted.text

    assert (
        await client.post(
            "/api/auth/login", json={"identifier": name, "password": "correct-horse-battery"}
        )
    ).status_code == 200
    forbidden = await client.put(f"{base}/remote", json={"url": str(bare), "auth": "none"})
    assert forbidden.status_code == 403
    assert (await client.delete(f"{base}/remote")).status_code == 403
    allowed = await client.post(f"{base}/remote/sync")
    assert allowed.status_code == 200, allowed.text


async def test_git_test_endpoint(client: AsyncClient, admin: dict, seed_repo: Path):
    res = await client.post("/api/git/test", json={"url": str(seed_repo), "auth": "none"})
    assert res.status_code == 200, res.text
    assert res.json() == {"defaultBranch": "trunk"}

    res = await client.post("/api/git/test", json={"url": "http://example.com/x.git"})
    assert res.status_code == 422
    res = await client.post("/api/git/test", json={"url": str(seed_repo), "auth": "token"})
    assert res.status_code == 422, "a token cannot be used with a server path"
    res = await client.post("/api/git/test", json={"url": str(seed_repo / "missing")})
    assert res.status_code == 422


async def _diverge(client: AsyncClient, ledger: dict, bare: Path, work: Path, marker: str) -> None:
    """Change README.md on both sides so the next Sync conflicts."""
    (work / "README.md").write_text(f"# Elsewhere {marker}\n")
    git("commit", "-q", "-am", f"Readme elsewhere {marker}", cwd=work)
    git("push", "-q", "origin", "main", cwd=work)
    res = await client.put(
        f"/api/ledgers/{ledger['owner']}/{ledger['slug']}/files/content",
        json={"path": "README.md", "content": f"# Studio {marker}\n"},
    )
    assert res.status_code == 200, res.text
    await get_remote_sync().drain()


async def test_resolve_keeps_the_side_you_choose(
    client: AsyncClient, admin: dict, ledger: dict, bare: Path, tmp_path: Path
):
    base = f"/api/ledgers/{ledger['owner']}/{ledger['slug']}"
    await _connect(ledger, admin, bare)
    work = tmp_path / "work"
    git("clone", "-q", str(bare), str(work), cwd=tmp_path)
    repo = get_store().paths(ledger["id"]).repo

    await _diverge(client, ledger, bare, work, "one")
    assert (await client.post(f"{base}/remote/sync")).json()["state"] == "diverged"
    kept = await client.post(f"{base}/remote/resolve", json={"keep": "remote"})
    assert kept.status_code == 200, kept.text
    assert kept.json()["state"] == "in_sync"
    assert head(repo) == head(bare) == head(work)
    assert (repo / "README.md").read_text() == "# Elsewhere one\n"

    git("pull", "-q", "--rebase", "origin", "main", cwd=work)
    await _diverge(client, ledger, bare, work, "two")
    assert (await client.post(f"{base}/remote/sync")).json()["state"] == "diverged"
    kept = await client.post(f"{base}/remote/resolve", json={"keep": "local"})
    assert kept.status_code == 200, kept.text
    assert kept.json()["state"] == "in_sync"
    assert head(bare) == head(repo)
    git("fetch", "-q", "origin", cwd=work)
    assert git("show", "origin/main:README.md", cwd=work) == "# Studio two"

    assert (
        await client.post(f"{base}/remote/resolve", json={"keep": "sideways"})
    ).status_code == 422


# ------------------------------------------------------------------ SSH keys


async def test_ssh_key_lifecycle(client: AsyncClient, user: dict, ledger: dict):
    assert (await client.get("/api/users/me/ssh-key")).status_code == 404

    res = await client.post("/api/users/me/ssh-key")
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["publicKey"].startswith("ssh-ed25519 ")
    assert body["publicKey"].endswith(f"beancount-studio:{user['username']}")
    assert body["fingerprint"].startswith("SHA256:")
    assert "PRIVATE" not in res.text and "privateKey" not in body
    assert (await client.post("/api/users/me/ssh-key")).status_code == 409
    assert (await client.get("/api/users/me/ssh-key")).json() == body

    async with get_session_factory()() as db:
        row = await db.get(UserSshKey, user["id"])
        assert row is not None
        assert "PRIVATE KEY" not in row.private_key_ciphertext
        private = decrypt_secret(row.private_key_ciphertext, get_settings().secret_key)
        assert private.startswith("-----BEGIN OPENSSH PRIVATE KEY-----")
        # A ledger that pushes with this key pins it.
        owned = await db.get(Ledger, ledger["id"])
        owned.remote = LedgerRemote(
            url="git@github.com:someone/books.git", transport="ssh", auth="ssh_key", branch="main"
        )
        await db.commit()
    refused = await client.delete("/api/users/me/ssh-key")
    assert refused.status_code == 409, refused.text
    async with get_session_factory()() as db:
        owned = await db.get(Ledger, ledger["id"])
        owned.remote = None
        await db.commit()
    assert (await client.delete("/api/users/me/ssh-key")).status_code == 204
    assert (await client.get("/api/users/me/ssh-key")).status_code == 404
    assert (await client.delete("/api/users/me/ssh-key")).status_code == 404


async def test_ssh_key_exists_on_disk_only_during_a_git_call():
    sync = get_remote_sync()
    private, _public, _fingerprint = generate_ssh_keypair("test")
    async with sync._git_env("ssh_key", private_key=private) as env:
        command = shlex.split(env["GIT_SSH_COMMAND"])
        key_file = Path(command[command.index("-i") + 1])
        # The test inspects the file git would be handed; blocking reads are the point here.
        assert key_file.read_text() == private  # noqa: ASYNC240
        assert oct(key_file.stat().st_mode & 0o777) == "0o600"  # noqa: ASYNC240
        assert "StrictHostKeyChecking=accept-new" in env["GIT_SSH_COMMAND"]
        assert "BatchMode=yes" in env["GIT_SSH_COMMAND"]
        assert env["GIT_ALLOW_PROTOCOL"] == "https:ssh:file"
    assert not key_file.exists()  # noqa: ASYNC240
    assert "github.com ssh-ed25519 " in sync.storage.known_hosts.read_text()  # noqa: ASYNC240

    async with sync._git_env("token", token="ghp_secret") as env:
        assert env["BS_GIT_SECRET"] == "ghp_secret"
        assert env["BS_GIT_USERNAME"] == "x-access-token"
        askpass = Path(env["GIT_ASKPASS"])
        assert oct(askpass.stat().st_mode & 0o777) == "0o700"  # noqa: ASYNC240


# ----------------------------------------------------------- review follow-ups


async def test_read_only_viewers_do_not_see_remote_details(
    client: AsyncClient, admin: dict, ledger: dict, bare: Path
):
    base = f"/api/ledgers/{ledger['owner']}/{ledger['slug']}"
    await _connect(ledger, admin, bare)
    assert (await client.patch(base, json={"visibility": "public"})).status_code == 200
    assert (await client.get(base)).json()["remote"]["url"] == str(bare)
    client.cookies.clear()
    anonymous = await client.get(base)
    assert anonymous.status_code == 200, anonymous.text
    assert anonymous.json()["remote"] is None


async def test_only_the_owner_connects_an_ssh_remote(
    client: AsyncClient, admin: dict, ledger: dict
):
    base = f"/api/ledgers/{ledger['owner']}/{ledger['slug']}"
    name = f"coadmin{uuid.uuid4().hex[:8]}"
    res = await client.post(
        "/api/auth/sign-up",
        json={
            "email": f"{name}@example.com",
            "username": name,
            "password": "correct-horse-battery",
        },
    )
    assert res.status_code == 201, res.text
    assert (
        await client.post(
            "/api/auth/login",
            json={"identifier": admin["username"], "password": "correct-horse-battery"},
        )
    ).status_code == 200
    assert (
        await client.put(f"{base}/collaborators/{name}", json={"role": "admin"})
    ).status_code == 200
    assert (
        await client.post(
            "/api/auth/login", json={"identifier": name, "password": "correct-horse-battery"}
        )
    ).status_code == 200
    res = await client.put(
        f"{base}/remote", json={"url": "git@github.com:someone/books.git", "auth": "ssh_key"}
    )
    assert res.status_code == 403, res.text


async def test_restart_turns_interrupted_pushes_into_errors(
    client: AsyncClient, admin: dict, ledger: dict, bare: Path
):
    await _connect(ledger, admin, bare)
    async with get_session_factory()() as db:
        row = await db.get(LedgerRemote, ledger["id"])
        row.state = "pushing"
        await db.commit()
    await get_remote_sync().recover()
    remote = await _remote(ledger["id"])
    assert remote.state == "error"
    assert "interrupted" in remote.last_error


async def test_a_write_before_any_read_uses_the_cloned_main_file(
    client: AsyncClient, admin: dict, tmp_path: Path
):
    path = tmp_path / "named"
    path.mkdir()
    git("init", "-q", "-b", "main", cwd=path)
    (path / "books.bean").write_text(
        'option "title" "Books"\noption "operating_currency" "USD"\n2026-01-01 open Assets:Cash\n'
    )
    git("add", "-A", cwd=path)
    git("commit", "-q", "-m", "Books", cwd=path)
    res = await client.post("/api/ledgers", json={"title": "Named", "source": {"url": str(path)}})
    assert res.status_code == 201, res.text
    ledger_id = res.json()["id"]
    base = f"/api/ledgers/{admin['username']}/named"

    get_store().evict(ledger_id)  # as after a restart: the first thing that happens is a write
    written = await client.put(
        f"{base}/files/content", json={"path": "notes.md", "content": "first\n"}
    )
    assert written.status_code == 200, written.text
    meta = await client.get(f"{base}/meta")
    assert meta.status_code == 200, meta.text
    errors = (await client.get(f"{base}/errors")).json()
    assert meta.json()["errorsCount"] == 0, errors
