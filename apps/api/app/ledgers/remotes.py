"""Remote repositories for ledgers: connect or clone, push after every commit, pull on demand.

Credentials never touch a command line or .git/config: tokens are answered to git through a
GIT_ASKPASS helper fed by environment variables, and SSH private keys exist as a 0600 file under
the storage tree only for the duration of one git call. Transport is limited to https, ssh and
local paths; local paths are for administrators and may not point into the data directory.
"""

from __future__ import annotations

import asyncio
import os
import re
import shlex
import shutil
import tempfile
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.exc import InvalidRequestError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.core.security import UndecryptableSecret, decrypt_secret, encrypt_secret
from app.db.base import get_session_factory
from app.db.models import Ledger, LedgerRemote, User, UserSshKey, utcnow
from app.errors import (
    AppError,
    ConflictError,
    ForbiddenError,
    LedgerError,
    NotFoundError,
    ValidationError,
)
from app.ledgers.git import Author, GitRepo, PushRejected
from app.ledgers.store import LedgerStore, get_store, safe_relative_path
from app.logging_setup import get_logger

log = get_logger(__name__)

CLONE_TIMEOUT = 300.0
NETWORK_TIMEOUT = 120.0
MAX_CLONE_BYTES = 1024**3
TRANSPORTS = ("https", "ssh", "local")
AUTHS = ("none", "token", "ssh_key")
STATES = ("in_sync", "pushing", "behind", "diverged", "error")
# Accepted as the user name for personal tokens by GitHub, GitLab and Gitea.
TOKEN_USERNAME = "x-access-token"
# Commits carry the person as author; replaying them during Sync needs a committer identity.
SYSTEM_COMMITTER = Author(name="Beancount Studio", email="studio@localhost")
# GitHub's published host keys (https://api.github.com/meta); other hosts are pinned on first use.
GITHUB_HOST_KEYS = """\
github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl
github.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxkZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg=
github.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA179cnfGWOWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bDYirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51ZqExKbQpTUNn+EjqoTwvqNj4kqx5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/WnwH6XoPWJzK5Nyu2zB3nAZp+S5hpQs+p1vN1/wsjk=
"""
_ASKPASS = """#!/bin/sh
# Answers git's credential prompts from the environment (written by app/ledgers/remotes.py).
case "$1" in
  [Uu]sername*) printf '%s\\n' "$BS_GIT_USERNAME" ;;
  *) printf '%s\\n' "$BS_GIT_SECRET" ;;
esac
"""
_SCP_LIKE = re.compile(r"^(?P<user>[\w.-]+)@(?P<host>[\w.-]+):(?P<path>[^/\s].*)$")
_LEDGER_GLOBS = ("*.bean", "*.beancount")


class MainFileRequiredError(ConflictError):
    """The repository has several top-level ledger files; the caller must pick one."""

    code = "main_file_required"


@dataclass(frozen=True)
class Source:
    url: str
    transport: str  # https | ssh | local
    host: str


def parse_source(raw: str) -> Source:
    """Normalise what a person typed into something git may be handed, or refuse it."""
    value = raw.strip()
    if not value:
        raise ValidationError("Enter a repository URL or a path on the server")
    if any(ch.isspace() for ch in value):
        raise ValidationError("A repository URL cannot contain spaces")
    scp = _SCP_LIKE.match(value)
    if scp:
        return Source(url=value, transport="ssh", host=scp["host"])
    if value.startswith("file://"):
        value = value.removeprefix("file://")
    if value.startswith("/"):
        return Source(url=str(Path(value)), transport="local", host="")
    parts = urlsplit(value)
    if parts.scheme == "https" and parts.hostname:
        if parts.username or parts.password:
            raise ValidationError(
                "Remove the credentials from the URL; add a token or use your SSH key instead"
            )
        return Source(url=value, transport="https", host=parts.hostname)
    if parts.scheme == "ssh" and parts.hostname:
        if parts.password:
            raise ValidationError("Remove the password from the URL; SSH uses your key")
        return Source(url=value, transport="ssh", host=parts.hostname)
    if parts.scheme == "http":
        raise ValidationError("Plain http would send credentials in the clear; use https or ssh")
    raise ValidationError(
        "Use an https:// or ssh:// URL, the git@host:path form, or an absolute path on the server"
    )


def detect_main_file(repo: Path, requested: str | None) -> str:
    """The file Fava loads: the requested one, else main.bean, else the only top-level ledger."""
    if requested:
        target = safe_relative_path(repo, requested)
        if not target.is_file():
            raise ValidationError(f"{requested} does not exist in the repository")
        return target.relative_to(repo).as_posix()
    if (repo / "main.bean").is_file():
        return "main.bean"
    found = sorted({p.name for pattern in _LEDGER_GLOBS for p in repo.glob(pattern) if p.is_file()})
    if len(found) == 1:
        return found[0]
    if not found:
        raise ValidationError("The repository has no .bean file at its top level")
    raise MainFileRequiredError(
        "Choose which file is the main ledger", details={"candidates": found}
    )


def _dir_size(path: Path) -> int:
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += os.lstat(os.path.join(root, name)).st_size
            except OSError:
                continue
    return total


class RemoteSync:
    def __init__(self, store: LedgerStore, settings: Settings) -> None:
        self.store = store
        self.settings = settings
        self.storage = store.storage
        self._ops: dict[str, asyncio.Lock] = {}  # one remote operation at a time per ledger
        self._pushes: dict[str, asyncio.Task[None]] = {}
        self._dirty: set[str] = set()  # commits that landed while a push was already running

    def install(self) -> None:
        if self.schedule_push not in self.store.commit_listeners:
            self.store.commit_listeners.append(self.schedule_push)

    async def recover(self) -> None:
        """After a restart no push can still be running; say so instead of showing 'pushing'."""
        async with get_session_factory()() as db:
            rows = (
                (await db.execute(select(LedgerRemote).where(LedgerRemote.state == "pushing")))
                .scalars()
                .all()
            )
            for row in rows:
                row.state = "error"
                row.last_error = (
                    "A push was interrupted by a restart. It retries on the next change, "
                    "or use Sync."
                )
            if rows:
                await db.commit()
                log.warning("%d remote(s) had a push interrupted by a restart", len(rows))

    @staticmethod
    def _failure(exc: Exception) -> str:
        return exc.message if isinstance(exc, AppError) else f"{type(exc).__name__}: {exc}"

    # ------------------------------------------------------------------ policy
    def check_source(self, source: Source, auth: str, user: User) -> None:
        if auth not in AUTHS:
            raise ValidationError("Unknown authentication method")
        if source.transport == "local":
            if not user.is_admin:
                raise ForbiddenError(
                    "Only administrators can import a repository from a path on this server"
                )
            if Path(source.url).resolve().is_relative_to(self.settings.data_dir):
                raise ForbiddenError("Repositories inside the data directory cannot be imported")
            if auth != "none":
                raise ValidationError("A path on the server needs no credentials")
        elif source.transport == "https" and auth == "ssh_key":
            raise ValidationError("An https URL uses a token (or nothing for a public repository)")
        elif source.transport == "ssh" and auth != "ssh_key":
            raise ValidationError("An SSH URL needs your SSH key; generate one in account settings")

    async def _check_local_repo(self, source: Source) -> None:
        if not await GitRepo.is_repo(Path(source.url)):
            raise ValidationError(f"{source.url} is not a git repository on this server")

    # ------------------------------------------------------------- credentials
    def _askpass(self) -> Path:
        path = self.storage.tmp_dir / "git-askpass"
        if not path.exists() or path.read_text() != _ASKPASS:
            path.write_text(_ASKPASS)
            path.chmod(0o700)
        return path

    def _known_hosts(self) -> Path:
        path = self.storage.known_hosts
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(GITHUB_HOST_KEYS)
        return path

    @asynccontextmanager
    async def _git_env(
        self, auth: str, *, token: str | None = None, private_key: str | None = None
    ) -> AsyncIterator[dict[str, str]]:
        """Environment for one git call carrying the credentials, cleaned up afterwards."""
        scratch: Path | None = None
        env = {
            "GIT_ALLOW_PROTOCOL": "https:ssh:file",
            # Our helper answers every prompt, so git never consults system credential stores.
            "GIT_ASKPASS": str(self._askpass()),
            "BS_GIT_USERNAME": TOKEN_USERNAME if auth == "token" else "",
            "BS_GIT_SECRET": "",
        }
        ssh = [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            f"UserKnownHostsFile={self._known_hosts()}",
            "-o",
            "StrictHostKeyChecking=accept-new",
        ]
        try:
            if auth == "token":
                if not token:
                    raise ValidationError("A token is required for this remote")
                env["BS_GIT_SECRET"] = token
            elif auth == "ssh_key":
                if not private_key:
                    raise ValidationError("No SSH key is available for this remote")
                scratch = Path(tempfile.mkdtemp(prefix="ssh-", dir=self.storage.tmp_dir))
                key_file = scratch / "id_ed25519"
                key_file.write_text(private_key)
                key_file.chmod(0o600)
                ssh += ["-i", str(key_file), "-o", "IdentitiesOnly=yes"]
            env["GIT_SSH_COMMAND"] = shlex.join(ssh)
            yield env
        finally:
            if scratch is not None:
                shutil.rmtree(scratch, ignore_errors=True)

    def _encrypt(self, secret: str) -> str:
        return encrypt_secret(secret, self.settings.secret_key)

    def _decrypt(self, ciphertext: str) -> str:
        try:
            return decrypt_secret(ciphertext, self.settings.secret_key)
        except UndecryptableSecret as exc:
            raise LedgerError(str(exc)) from exc

    async def _user_private_key(self, db: AsyncSession, user_id: str) -> str:
        row = await db.get(UserSshKey, user_id)
        if row is None:
            raise ValidationError("Generate an SSH key in account settings first")
        return self._decrypt(row.private_key_ciphertext)

    async def _credentials(
        self, db: AsyncSession, remote: LedgerRemote
    ) -> tuple[str | None, str | None]:
        """(token, private key) for a stored remote; SSH uses the key of whoever connected it."""
        token = self._decrypt(remote.token_ciphertext) if remote.token_ciphertext else None
        key = None
        if remote.auth == "ssh_key":
            if remote.ssh_user_id is None:
                raise ValidationError(
                    "The account whose SSH key pushed this remote is gone; reconnect the remote"
                )
            key = await self._user_private_key(db, remote.ssh_user_id)
        return token, key

    # -------------------------------------------------------------- operations
    async def test(
        self,
        db: AsyncSession,
        user: User,
        source: Source,
        auth: str,
        token: str | None = None,
    ) -> str | None:
        """Reach the remote with these credentials; returns its default branch, None if empty."""
        self.check_source(source, auth, user)
        if source.transport == "local":
            await self._check_local_repo(source)
        key = await self._user_private_key(db, user.id) if auth == "ssh_key" else None
        async with self._git_env(auth, token=token, private_key=key) as env:
            return await GitRepo.default_branch(
                source.url, env=env, time_limit=NETWORK_TIMEOUT, cwd=self.storage.tmp_dir
            )

    async def clone(
        self,
        db: AsyncSession,
        ledger: Ledger,
        user: User,
        source: Source,
        auth: str,
        token: str | None = None,
        main_file: str | None = None,
    ) -> str:
        """Create the ledger's repository by cloning `source`; returns the main file to record.

        Adds the remote row to `db` without committing, so the caller's transaction decides.
        """
        self.check_source(source, auth, user)
        if source.transport == "local":
            await self._check_local_repo(source)
        key = await self._user_private_key(db, user.id) if auth == "ssh_key" else None
        paths = self.store.paths(ledger)
        if paths.repo.exists():
            raise LedgerError("Ledger directory already exists")
        try:
            async with self._git_env(auth, token=token, private_key=key) as env:
                repo = await GitRepo.clone(
                    source.url, paths.repo, env=env, time_limit=CLONE_TIMEOUT
                )
            size = await asyncio.to_thread(_dir_size, paths.repo)
            if size > MAX_CLONE_BYTES:
                raise ValidationError("The repository is larger than the 1 GiB limit")
            head = await repo.head()
            if head is None:
                raise ValidationError("The repository has no commits yet")
            chosen = await asyncio.to_thread(detect_main_file, paths.repo, main_file)
            branch = await repo.current_branch()
        except BaseException:
            await asyncio.to_thread(shutil.rmtree, paths.root, ignore_errors=True)
            raise
        ledger.remote = LedgerRemote(
            url=source.url,
            transport=source.transport,
            auth=auth,
            token_ciphertext=self._encrypt(token) if auth == "token" and token else None,
            ssh_user_id=user.id if auth == "ssh_key" else None,
            branch=branch,
            state="in_sync",
            last_pushed_sha=head,
            last_synced_at=utcnow(),
        )
        log.info("ledger %s cloned from %s (%s)", ledger.id, source.url, source.transport)
        return chosen

    async def connect(
        self,
        db: AsyncSession,
        ledger: Ledger,
        user: User,
        source: Source,
        auth: str,
        token: str | None = None,
    ) -> LedgerRemote:
        """Point an existing ledger at a remote and push its history there.

        `user` is the person connecting; an SSH remote pushes with their key from then on.
        """
        repo = self.store.repo(ledger)
        default_branch = await self.test(db, user, source, auth, token)
        branch = default_branch or await repo.current_branch()
        async with self._op_lock(ledger.id):
            await repo.set_remote(source.url)
            remote = ledger.remote
            if remote is None:
                remote = LedgerRemote()
                ledger.remote = remote
            remote.url = source.url
            remote.transport = source.transport
            remote.auth = auth
            remote.token_ciphertext = self._encrypt(token) if auth == "token" and token else None
            remote.ssh_user_id = user.id if auth == "ssh_key" else None
            remote.branch = branch
            remote.state = "pushing"
            remote.last_pushed_sha = None
            remote.last_synced_at = None
            remote.last_error = ""
            await db.commit()
        log.info(
            "ledger %s connected to %s (%s, %s)", ledger.id, source.url, source.transport, auth
        )
        self.schedule_push(ledger.id)
        return remote

    async def disconnect(self, db: AsyncSession, ledger: Ledger) -> None:
        async with self._op_lock(ledger.id):
            await self.store.repo(ledger).remove_remote()
            if ledger.remote is not None:
                ledger.remote = None  # delete-orphan removes the row
                await db.commit()
        log.info("ledger %s disconnected from its remote", ledger.id)

    # -------------------------------------------------------------------- push
    def schedule_push(self, ledger_id: str) -> None:
        """Push soon, off the request path. Called by the store after every commit."""
        running = self._pushes.get(ledger_id)
        if running is not None and not running.done():
            self._dirty.add(ledger_id)
            return
        self._pushes[ledger_id] = asyncio.create_task(
            self._push_task(ledger_id), name=f"push:{ledger_id}"
        )

    async def _push_task(self, ledger_id: str) -> None:
        try:
            async with get_session_factory()() as db:
                remote = await db.get(LedgerRemote, ledger_id)
                ledger = await db.get(Ledger, ledger_id)
                if remote is not None and ledger is not None:
                    await self._push(db, ledger, remote)
        except Exception:
            log.exception("background push failed for ledger %s", ledger_id)
        finally:
            self._pushes.pop(ledger_id, None)
            if ledger_id in self._dirty:
                self._dirty.discard(ledger_id)
                self.schedule_push(ledger_id)

    async def _push(self, db: AsyncSession, ledger: Ledger, remote: LedgerRemote) -> None:
        async with self._op_lock(ledger.id):
            # The row may have changed while this push waited for the lock: a Sync may have found
            # a conflict, an admin may have reconnected or disconnected the remote.
            try:
                await db.refresh(remote)
            except InvalidRequestError:
                return  # disconnected meanwhile
            if remote.state == "diverged":
                return  # paused until the divergence is resolved
            repo = self.store.repo(ledger)
            head = await repo.head()
            if head is None or head == remote.last_pushed_sha:
                return
            remote.state = "pushing"
            await db.commit()
            try:
                token, key = await self._credentials(db, remote)
                async with self._git_env(remote.auth, token=token, private_key=key) as env:
                    await repo.push(remote.branch, ref=head, env=env, time_limit=NETWORK_TIMEOUT)
            except PushRejected as exc:
                remote.state = "behind"
                remote.last_error = f"{exc.message}. Sync to bring them in."
            except Exception as exc:  # whatever happens, never leave the row at "pushing"
                remote.state = "error"
                remote.last_error = self._failure(exc)
                log.warning(
                    "push of ledger %s to %s failed: %s", ledger.id, remote.url, remote.last_error
                )
            else:
                remote.state = "in_sync"
                remote.last_error = ""
                remote.last_pushed_sha = head
                remote.last_synced_at = utcnow()
                log.info("pushed ledger %s to %s", ledger.id, remote.url)
            await db.commit()

    # -------------------------------------------------------------------- sync
    async def sync(self, db: AsyncSession, ledger: Ledger) -> LedgerRemote:
        """Bring remote commits in (fast-forward or rebase), then push. Conflicts stop it."""
        remote = ledger.remote
        if remote is None:
            raise NotFoundError("This ledger has no remote")
        # Network work happens outside the ledger's write lock; only integrating the remote
        # commits into the working tree takes it, so edits are not stalled by a slow host.
        async with self._op_lock(ledger.id):
            repo = self.store.repo(ledger)
            try:
                token, key = await self._credentials(db, remote)
                async with self._git_env(remote.auth, token=token, private_key=key) as env:
                    await repo.fetch(env=env, time_limit=NETWORK_TIMEOUT)
                    exists = await repo.remote_branch_exists(remote.branch)
                    async with self.store.write_lock(ledger):
                        ahead, behind = (
                            await repo.ahead_behind(remote.branch)
                            if exists
                            else (await repo.count_commits(), 0)
                        )
                        if behind:
                            if ahead:
                                conflicts = await repo.rebase_onto_remote(
                                    remote.branch, SYSTEM_COMMITTER
                                )
                                if conflicts:
                                    remote.state = "diverged"
                                    remote.last_error = (
                                        "Local and remote changes conflict in "
                                        + ", ".join(conflicts)
                                        + ". Keep one side below, or resolve outside Studio."
                                    )
                                    await db.commit()
                                    return remote
                            else:
                                await repo.fast_forward(remote.branch)
                            await self.store.reload(ledger)
                        head = await repo.head()
                    if head is not None and (ahead or not exists):
                        await repo.push(
                            remote.branch, ref=head, env=env, time_limit=NETWORK_TIMEOUT
                        )
            except PushRejected as exc:
                remote.state = "behind"
                remote.last_error = f"{exc.message}. Sync again."
            except Exception as exc:
                remote.state = "error"
                remote.last_error = self._failure(exc)
                log.warning(
                    "sync of ledger %s with %s failed: %s", ledger.id, remote.url, remote.last_error
                )
            else:
                remote.state = "in_sync"
                remote.last_error = ""
                remote.last_pushed_sha = await repo.head()
                remote.last_synced_at = utcnow()
                log.info("synced ledger %s with %s", ledger.id, remote.url)
            await db.commit()
            return remote

    async def resolve(self, db: AsyncSession, ledger: Ledger, keep: str) -> LedgerRemote:
        """End a divergence by choosing a side: `remote` resets this ledger to the remote branch,
        `local` overwrites the remote branch with this ledger's history."""
        remote = ledger.remote
        if remote is None:
            raise NotFoundError("This ledger has no remote")
        if keep not in ("local", "remote"):
            raise ValidationError("Choose which version to keep: local or remote")
        async with self._op_lock(ledger.id):
            repo = self.store.repo(ledger)
            try:
                token, key = await self._credentials(db, remote)
                async with self._git_env(remote.auth, token=token, private_key=key) as env:
                    await repo.fetch(env=env, time_limit=NETWORK_TIMEOUT)
                    if keep == "remote":
                        async with self.store.write_lock(ledger):
                            await repo.reset_to_remote(remote.branch)
                            await self.store.reload(ledger)
                    else:
                        await repo.force_push(
                            remote.branch,
                            expected_remote=await repo.remote_sha(remote.branch),
                            env=env,
                            time_limit=NETWORK_TIMEOUT,
                        )
            except Exception as exc:
                remote.state = "error"
                remote.last_error = self._failure(exc)
                log.warning(
                    "resolving ledger %s against %s failed: %s",
                    ledger.id,
                    remote.url,
                    remote.last_error,
                )
            else:
                remote.state = "in_sync"
                remote.last_error = ""
                remote.last_pushed_sha = await repo.head()
                remote.last_synced_at = utcnow()
                log.info(
                    "ledger %s resolved its divergence keeping the %s version", ledger.id, keep
                )
            await db.commit()
            return remote

    async def drain(self) -> None:
        """Wait for every scheduled push to finish (tests and shutdown)."""
        while self._pushes:
            await asyncio.gather(*list(self._pushes.values()), return_exceptions=True)

    def _op_lock(self, ledger_id: str) -> asyncio.Lock:
        return self._ops.setdefault(ledger_id, asyncio.Lock())


@lru_cache
def get_remote_sync() -> RemoteSync:
    return RemoteSync(get_store(), get_settings())
