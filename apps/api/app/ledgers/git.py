"""Thin async wrapper over the git CLI. Each ledger is a plain git repository on disk."""

from __future__ import annotations

import asyncio
import os
import re
import shlex
from dataclasses import dataclass, field
from pathlib import Path

from app.errors import LedgerError, NotFoundError
from app.logging_setup import get_logger

log = get_logger(__name__)

_SEP = "\x1f"
_REC = "\x1e"
_LOG_FORMAT = _SEP.join(["%H", "%h", "%an", "%ae", "%aI", "%P", "%s", "%b"]) + _REC


@dataclass(frozen=True)
class Author:
    name: str
    email: str


@dataclass(frozen=True)
class Commit:
    sha: str
    short_sha: str
    author_name: str
    author_email: str
    date: str
    parents: list[str]
    subject: str
    body: str

    def to_dict(self) -> dict:
        return {
            "sha": self.sha,
            "shortSha": self.short_sha,
            "author": {"name": self.author_name, "email": self.author_email, "date": self.date},
            "parents": self.parents,
            "message": self.subject if not self.body else f"{self.subject}\n\n{self.body}",
            "subject": self.subject,
        }


@dataclass(frozen=True)
class FileChange:
    path: str
    additions: int
    deletions: int
    status: str  # A | M | D | R


@dataclass(frozen=True)
class CommitDetails:
    commit: Commit
    files: list[FileChange]
    diff: str

    def to_dict(self) -> dict:
        return {
            **self.commit.to_dict(),
            "files": [
                {
                    "filename": f.path,
                    "additions": f.additions,
                    "deletions": f.deletions,
                    "status": f.status,
                }
                for f in self.files
            ],
            "stats": {
                "additions": sum(f.additions for f in self.files),
                "deletions": sum(f.deletions for f in self.files),
                "total": sum(f.additions + f.deletions for f in self.files),
            },
            "diff": self.diff,
        }


@dataclass(frozen=True)
class TreeEntry:
    name: str
    path: str
    type: str  # file | dir
    size: int
    sha: str
    last_commit: Commit | None = field(default=None)


class GitError(LedgerError):
    code = "git_error"


class PushRejected(GitError):
    """The remote branch has commits this repository does not have (non-fast-forward)."""

    code = "push_rejected"


@dataclass(frozen=True)
class GitResult:
    code: int
    stdout: str
    stderr: str


# Never let git wait for a human: prompts fail instead of hanging a request or a background push.
_BASE_ENV = {"GIT_TERMINAL_PROMPT": "0"}
_REJECTED = re.compile(r"non-fast-forward|fetch first|\[rejected\]|stale info", re.IGNORECASE)
_CONFLICT_FILE = re.compile(r"Merge conflict in (.+)$", re.MULTILINE)


async def run_git(
    args: tuple[str, ...] | list[str],
    cwd: Path,
    *,
    env: dict[str, str] | None = None,
    input_bytes: bytes | None = None,
    time_limit: float | None = None,
) -> GitResult:
    """Run git and return its exit code and output; `time_limit` (seconds) kills it and raises."""
    proc = await asyncio.create_subprocess_exec(
        "git",
        *args,
        cwd=cwd,
        env={**os.environ, **_BASE_ENV, **(env or {})},
        stdin=asyncio.subprocess.PIPE if input_bytes is not None else None,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        async with asyncio.timeout(time_limit):
            out, err = await proc.communicate(input_bytes)
    except TimeoutError:
        proc.kill()
        await proc.wait()
        log.error("git %s timed out after %ss in %s", shlex.join(args), time_limit, cwd)
        raise GitError(f"git {args[0]} timed out after {time_limit:g} seconds") from None
    return GitResult(
        proc.returncode or 0, out.decode("utf-8", "replace"), err.decode("utf-8", "replace")
    )


class GitRepo:
    def __init__(self, path: Path) -> None:
        self.path = path

    async def _run(
        self,
        *args: str,
        check: bool = True,
        input_bytes: bytes | None = None,
        env: dict[str, str] | None = None,
        time_limit: float | None = None,
    ) -> str:
        result = await run_git(
            args, self.path, env=env, input_bytes=input_bytes, time_limit=time_limit
        )
        if check and result.code != 0:
            message = result.stderr.strip()
            log.error("git %s failed in %s: %s", shlex.join(args), self.path, message)
            raise GitError(f"git {args[0]} failed: {message}")
        return result.stdout

    async def _run_bytes(self, *args: str) -> bytes:
        proc = await asyncio.create_subprocess_exec(
            "git",
            *args,
            cwd=self.path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out, err = await proc.communicate()
        if proc.returncode != 0:
            message = err.decode("utf-8", "replace").strip()
            log.error("git %s failed in %s: %s", shlex.join(args), self.path, message)
            raise GitError(f"git {args[0]} failed: {message}")
        return out

    @classmethod
    async def init(cls, path: Path) -> GitRepo:
        await asyncio.to_thread(path.mkdir, parents=True, exist_ok=True)
        repo = cls(path)
        await repo._run("init", "-q", "-b", "main")
        await repo._configure()
        return repo

    @classmethod
    async def clone(
        cls, url: str, path: Path, *, env: dict[str, str] | None = None, time_limit: float
    ) -> GitRepo:
        """Clone `url` into `path` (which must not exist yet) with its full history."""
        await asyncio.to_thread(path.parent.mkdir, parents=True, exist_ok=True)
        result = await run_git(
            ["clone", "-q", "--", url, str(path)], path.parent, env=env, time_limit=time_limit
        )
        if result.code != 0:
            message = result.stderr.strip()
            log.error("git clone of %s failed: %s", url, message)
            raise GitError(f"git clone failed: {message}")
        repo = cls(path)
        await repo._configure()
        return repo

    async def _configure(self) -> None:
        await self._run("config", "core.autocrlf", "false")
        await self._run("config", "commit.gpgsign", "false")

    @staticmethod
    async def is_repo(path: Path) -> bool:
        """True for a working tree or a bare repository at `path`."""
        if not await asyncio.to_thread(path.is_dir):
            return False
        return (await run_git(["rev-parse", "--git-dir"], path)).code == 0

    @staticmethod
    async def default_branch(
        url: str, *, env: dict[str, str] | None = None, time_limit: float, cwd: Path
    ) -> str | None:
        """Ask a remote which branch HEAD points at, without cloning; None for an empty remote."""
        result = await run_git(
            ["ls-remote", "--symref", "--", url, "HEAD"], cwd, env=env, time_limit=time_limit
        )
        if result.code != 0:
            raise GitError(f"git ls-remote failed: {result.stderr.strip()}")
        for line in result.stdout.splitlines():
            if line.startswith("ref: refs/heads/"):
                return line.removeprefix("ref: refs/heads/").split("\t", 1)[0]
        return None

    # ------------------------------------------------------------- remotes

    async def remote_url(self) -> str | None:
        out = await self._run("remote", "get-url", "origin", check=False)
        return out.strip() or None

    async def set_remote(self, url: str) -> None:
        if await self.remote_url() is None:
            await self._run("remote", "add", "origin", url)
        else:
            await self._run("remote", "set-url", "origin", url)

    async def remove_remote(self) -> None:
        await self._run("remote", "remove", "origin", check=False)

    async def current_branch(self) -> str:
        out = await self._run("symbolic-ref", "--short", "-q", "HEAD", check=False)
        return out.strip() or "main"

    async def fetch(self, *, env: dict[str, str], time_limit: float) -> None:
        await self._run("fetch", "-q", "origin", env=env, time_limit=time_limit)

    async def push(
        self, branch: str, *, ref: str = "HEAD", env: dict[str, str], time_limit: float
    ) -> None:
        result = await run_git(
            ["push", "-q", "origin", f"{ref}:refs/heads/{branch}"],
            self.path,
            env=env,
            time_limit=time_limit,
        )
        if result.code == 0:
            return
        message = result.stderr.strip()
        if _REJECTED.search(message):
            raise PushRejected("The remote has commits this ledger does not have yet")
        log.error("git push failed in %s: %s", self.path, message)
        raise GitError(f"git push failed: {message}")

    async def remote_branch_exists(self, branch: str) -> bool:
        out = await self._run(
            "rev-parse", "--verify", "-q", f"refs/remotes/origin/{branch}", check=False
        )
        return bool(out.strip())

    async def ahead_behind(self, branch: str) -> tuple[int, int]:
        """(commits only here, commits only on origin/<branch>)."""
        out = await self._run(
            "rev-list", "--left-right", "--count", f"HEAD...refs/remotes/origin/{branch}"
        )
        ahead, behind = out.split()
        return int(ahead), int(behind)

    async def fast_forward(self, branch: str) -> None:
        await self._run("merge", "-q", "--ff-only", f"refs/remotes/origin/{branch}")

    async def reset_to_remote(self, branch: str) -> None:
        """Make the working tree and HEAD identical to origin/<branch>, dropping local commits."""
        await self._run("reset", "-q", "--hard", f"refs/remotes/origin/{branch}")

    async def remote_sha(self, branch: str) -> str:
        return (await self._run("rev-parse", f"refs/remotes/origin/{branch}")).strip()

    async def force_push(
        self, branch: str, *, expected_remote: str, env: dict[str, str], time_limit: float
    ) -> None:
        """Overwrite origin/<branch> with HEAD, but only if it still is what we last fetched."""
        await self._run(
            "push",
            "-q",
            f"--force-with-lease=refs/heads/{branch}:{expected_remote}",
            "origin",
            f"HEAD:refs/heads/{branch}",
            env=env,
            time_limit=time_limit,
        )

    async def rebase_onto_remote(self, branch: str, committer: Author) -> list[str] | None:
        """Replay local commits on top of origin/<branch>. Returns the conflicting files on failure
        (the rebase is aborted and the tree left as it was), or None on success."""
        result = await run_git(
            [*self._author_env_args(committer), "rebase", "-q", f"refs/remotes/origin/{branch}"],
            self.path,
        )
        if result.code == 0:
            return None
        await self._run("rebase", "--abort", check=False)
        files = sorted(set(_CONFLICT_FILE.findall(result.stdout + "\n" + result.stderr)))
        log.warning("rebase in %s conflicted in %s", self.path, files or "unknown files")
        return files or ["(see git for details)"]

    def _author_env_args(self, author: Author) -> list[str]:
        return [
            "-c",
            f"user.name={author.name}",
            "-c",
            f"user.email={author.email}",
        ]

    async def commit_all(self, message: str, author: Author) -> str | None:
        """Stage everything and commit. Returns the new sha, or None when nothing changed."""
        await self._run("add", "-A")
        status = await self._run("status", "--porcelain")
        if not status.strip():
            return None
        await self._run(
            *self._author_env_args(author), "commit", "-q", "--no-verify", "-m", message
        )
        return (await self._run("rev-parse", "HEAD")).strip()

    async def head(self) -> str | None:
        out = await self._run("rev-parse", "--verify", "-q", "HEAD", check=False)
        return out.strip() or None

    @staticmethod
    def _parse_log(raw: str) -> list[Commit]:
        commits: list[Commit] = []
        for record in raw.split(_REC):
            if not record.strip():
                continue
            parts = record.lstrip("\n").split(_SEP)
            if len(parts) < 8:
                continue
            sha, short, an, ae, date, parents, subject, body = parts[:8]
            commits.append(
                Commit(
                    sha=sha,
                    short_sha=short,
                    author_name=an,
                    author_email=ae,
                    date=date,
                    parents=[p for p in parents.split() if p],
                    subject=subject,
                    body=body.strip(),
                )
            )
        return commits

    async def log(
        self, *, limit: int = 30, skip: int = 0, path: str | None = None, ref: str = "HEAD"
    ) -> list[Commit]:
        if await self.head() is None:
            return []
        args = ["log", ref, f"--max-count={limit}", f"--skip={skip}", f"--format={_LOG_FORMAT}"]
        if path:
            args += ["--", path]
        return self._parse_log(await self._run(*args))

    async def count_commits(self, ref: str = "HEAD", path: str | None = None) -> int:
        if await self.head() is None:
            return 0
        args = ["rev-list", "--count", ref]
        if path:
            args += ["--", path]
        return int((await self._run(*args)).strip() or 0)

    async def show(self, sha: str) -> CommitDetails:
        commits = self._parse_log(
            await self._run("log", "-1", f"--format={_LOG_FORMAT}", sha, check=False)
        )
        if not commits:
            raise NotFoundError(f"Commit {sha} not found")
        commit = commits[0]
        numstat = await self._run("show", "--format=", "--numstat", "--no-renames", sha)
        name_status = await self._run("show", "--format=", "--name-status", "--no-renames", sha)
        statuses: dict[str, str] = {}
        for line in name_status.splitlines():
            if "\t" in line:
                status, name = line.split("\t", 1)
                statuses[name] = status[:1]
        files: list[FileChange] = []
        for line in numstat.splitlines():
            parts = line.split("\t")
            if len(parts) != 3:
                continue
            add, dele, name = parts
            files.append(
                FileChange(
                    path=name,
                    additions=int(add) if add.isdigit() else 0,
                    deletions=int(dele) if dele.isdigit() else 0,
                    status=statuses.get(name, "M"),
                )
            )
        diff = await self._run("show", "--format=", "--no-renames", "-p", "--no-color", sha)
        return CommitDetails(commit=commit, files=files, diff=diff)

    async def ls_tree(self, ref: str, directory: str = "") -> list[TreeEntry]:
        if await self.head() is None:
            return []
        spec = f"{ref}:{directory}" if directory else ref
        raw = await self._run("ls-tree", "-l", spec, check=False)
        entries: list[TreeEntry] = []
        for line in raw.splitlines():
            meta, _, name = line.partition("\t")
            parts = meta.split()
            if len(parts) < 4:
                continue
            _mode, kind, sha, size = parts[0], parts[1], parts[2], parts[3]
            full = f"{directory.rstrip('/')}/{name}" if directory else name
            entries.append(
                TreeEntry(
                    name=name,
                    path=full,
                    type="dir" if kind == "tree" else "file",
                    size=int(size) if size.isdigit() else 0,
                    sha=sha,
                )
            )
        entries.sort(key=lambda e: (e.type != "dir", e.name.lower()))
        return entries

    async def read_blob(self, ref: str, path: str) -> bytes:
        try:
            return await self._run_bytes("show", f"{ref}:{path}")
        except GitError as exc:
            raise NotFoundError(f"{path} not found at {ref}") from exc

    async def archive_zip(self, ref: str = "HEAD") -> bytes:
        return await self._run_bytes("archive", "--format=zip", ref)

    async def last_commit_for(self, path: str) -> Commit | None:
        commits = await self.log(limit=1, path=path)
        return commits[0] if commits else None
