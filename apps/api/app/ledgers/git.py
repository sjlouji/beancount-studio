"""Thin async wrapper over the git CLI. Each ledger is a plain git repository on disk."""

from __future__ import annotations

import asyncio
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


class GitRepo:
    def __init__(self, path: Path) -> None:
        self.path = path

    async def _run(self, *args: str, check: bool = True, input_bytes: bytes | None = None) -> str:
        proc = await asyncio.create_subprocess_exec(
            "git",
            *args,
            cwd=self.path,
            stdin=asyncio.subprocess.PIPE if input_bytes is not None else None,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out, err = await proc.communicate(input_bytes)
        if check and proc.returncode != 0:
            message = err.decode("utf-8", "replace").strip()
            log.error("git %s failed in %s: %s", shlex.join(args), self.path, message)
            raise GitError(f"git {args[0]} failed: {message}")
        return out.decode("utf-8", "replace")

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
        await repo._run("config", "core.autocrlf", "false")
        await repo._run("config", "commit.gpgsign", "false")
        return repo

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
