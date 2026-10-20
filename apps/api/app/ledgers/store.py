"""Ledger storage: one git repository per ledger plus a cached Fava engine instance.

All Fava access is serialised per ledger and executed off the event loop, because
FavaLedger is synchronous and not thread-safe while reloading.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import difflib
import hashlib
import shutil
import tempfile
import threading
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TypeVar

from beancount import loader as beancount_loader
from fava.core import FavaLedger

from app.errors import LedgerError, NotFoundError, ValidationError
from app.ledgers.git import Author, GitRepo
from app.logging_setup import get_logger
from app.storage import LedgerPaths, Storage, get_storage

log = get_logger(__name__)
T = TypeVar("T")

TEMPLATES = ("blank", "starter", "example")
SEED_DIR = Path(__file__).resolve().parent.parent / "seed"
_IGNORED_DIRS = {".git"}
_TEXT_EXTENSIONS = {
    ".bean",
    ".beancount",
    ".md",
    ".txt",
    ".csv",
    ".py",
    ".json",
    ".yaml",
    ".yml",
    ".ofx",
    ".qif",
}


@dataclass(frozen=True)
class ProjectedError:
    filename: str
    lineno: int | None
    message: str
    type: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "filename": self.filename,
            "lineno": self.lineno,
            "message": self.message,
            "type": self.type,
        }


@dataclass(frozen=True)
class Projection:
    errors: list[ProjectedError]
    diffs: list[dict[str, str]]

    def to_dict(self) -> dict[str, Any]:
        return {"errors": [e.to_dict() for e in self.errors], "diffs": self.diffs}


def safe_relative_path(repo: Path, user_path: str) -> Path:
    """Resolve a user-supplied path inside the repo, refusing traversal and the .git dir."""
    cleaned = user_path.strip().lstrip("/")
    if not cleaned or cleaned in (".", ".."):
        raise ValidationError("A file path is required")
    candidate = (repo / cleaned).resolve()
    repo_resolved = repo.resolve()
    if candidate != repo_resolved and repo_resolved not in candidate.parents:
        raise ValidationError("Path escapes the ledger directory")
    rel = candidate.relative_to(repo_resolved)
    if rel.parts and rel.parts[0] == ".git":
        raise ValidationError("Path is not allowed")
    return candidate


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def is_text_path(path: Path) -> bool:
    return path.suffix.lower() in _TEXT_EXTENSIONS


class _LedgerHandle:
    def __init__(self, paths: LedgerPaths) -> None:
        self.paths = paths
        self.lock = threading.RLock()
        self.write_lock = asyncio.Lock()
        self.fava: FavaLedger | None = None

    def engine(self) -> FavaLedger:
        with self.lock:
            if self.fava is None:
                log.info("loading ledger %s", self.paths.main_file)
                self.fava = FavaLedger(str(self.paths.main_file), poll_watcher=True)
            else:
                self.fava.changed()
            return self.fava


class LedgerStore:
    def __init__(self, storage: Storage | None = None) -> None:
        self.storage = storage or get_storage()
        self._handles: dict[str, _LedgerHandle] = {}
        self._handles_lock = threading.Lock()
        # Called with the ledger id after every commit; the remote sync schedules its push here.
        self.commit_listeners: list[Callable[[str], None]] = []

    # ------------------------------------------------------------------ paths
    def paths(self, ledger_id: str, main_file: str = "main.bean") -> LedgerPaths:
        return self.storage.ledger_paths(ledger_id, main_file)

    def repo(self, ledger_id: str) -> GitRepo:
        return GitRepo(self.paths(ledger_id).repo)

    def _handle(self, ledger_id: str, main_file: str = "main.bean") -> _LedgerHandle:
        paths = self.paths(ledger_id, main_file)
        with self._handles_lock:
            handle = self._handles.get(ledger_id)
            if handle is None:
                handle = _LedgerHandle(paths)
                self._handles[ledger_id] = handle
            elif handle.fava is None and handle.paths != paths:
                # Created by write_lock() or reload(), which do not know the ledger's main file;
                # the first read names it, before the engine is loaded.
                handle.paths = paths
            return handle

    def evict(self, ledger_id: str) -> None:
        with self._handles_lock:
            self._handles.pop(ledger_id, None)

    # --------------------------------------------------------------- lifecycle
    async def create(
        self,
        ledger_id: str,
        *,
        template: str,
        title: str,
        currency: str,
        author: Author,
    ) -> str:
        if template not in TEMPLATES:
            raise ValidationError(f"Unknown template '{template}'")
        paths = self.paths(ledger_id)
        if paths.repo.exists():
            raise LedgerError("Ledger directory already exists")
        paths.repo.mkdir(parents=True)
        today = dt.date.today()
        if template == "example":
            source = (SEED_DIR / "example.bean").read_text("utf-8")
            source = source.replace(
                'option "title" "Example Beancount file"', f'option "title" "{title}"'
            )
        else:
            source = (
                (SEED_DIR / f"{template}.bean")
                .read_text("utf-8")
                .format(
                    title=title.replace('"', "'"),
                    currency=currency,
                    date=today.replace(day=1).isoformat(),
                    date_next=(today.replace(day=1) + dt.timedelta(days=1)).isoformat(),
                )
            )
        paths.main_file.write_text(source, encoding="utf-8")
        (paths.repo / "README.md").write_text(
            f"# {title}\n\nA Beancount ledger managed with Beancount Studio.\n", encoding="utf-8"
        )
        (paths.repo / ".gitignore").write_text("*.pyc\n__pycache__/\n.DS_Store\n", encoding="utf-8")
        repo = await GitRepo.init(paths.repo)
        sha = await repo.commit_all("Create ledger", author)
        return sha or ""

    async def delete(self, ledger_id: str) -> None:
        self.evict(ledger_id)
        paths = self.paths(ledger_id)
        if paths.root.exists():
            await asyncio.to_thread(shutil.rmtree, paths.root)

    # ------------------------------------------------------------- fava access
    async def run(
        self, ledger_id: str, fn: Callable[[FavaLedger], T], main_file: str = "main.bean"
    ) -> T:
        """Run `fn(fava_ledger)` on a worker thread, serialised per ledger."""
        handle = self._handle(ledger_id, main_file)

        def _call() -> T:
            with handle.lock:
                engine = handle.engine()
                return fn(engine)

        return await asyncio.to_thread(_call)

    def write_lock(self, ledger_id: str) -> asyncio.Lock:
        return self._handle(ledger_id).write_lock

    async def commit(self, ledger_id: str, message: str, author: Author) -> str | None:
        sha = await self.repo(ledger_id).commit_all(message, author)
        await self.reload(ledger_id)
        if sha is not None:
            for listener in self.commit_listeners:
                try:
                    listener(ledger_id)
                except Exception:  # a listener must never turn a saved commit into an error
                    log.exception("commit listener failed for ledger %s", ledger_id)
        return sha

    async def reload(self, ledger_id: str) -> None:
        """Make the cached engine pick up what is now in the working tree."""
        handle = self._handle(ledger_id)

        def _reload() -> None:
            with handle.lock:
                if handle.fava is not None:
                    handle.fava.changed()

        await asyncio.to_thread(_reload)

    # ------------------------------------------------------------- projections
    async def project(
        self, ledger_id: str, changes: dict[str, str | None], main_file: str = "main.bean"
    ) -> Projection:
        """Apply `changes` (path -> new content, None = delete) to a scratch copy and bean-check it."""
        paths = self.paths(ledger_id, main_file)

        def _project() -> Projection:
            diffs: list[dict[str, str]] = []
            with tempfile.TemporaryDirectory(prefix="bs-project-") as tmp:
                scratch = Path(tmp) / "repo"
                shutil.copytree(paths.repo, scratch, ignore=shutil.ignore_patterns(".git"))
                for rel, content in changes.items():
                    target = safe_relative_path(scratch, rel)
                    before = (
                        target.read_text("utf-8") if target.exists() and target.is_file() else ""
                    )
                    if content is None:
                        if target.exists():
                            target.unlink()
                        after = ""
                    else:
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_text(content, encoding="utf-8")
                        after = content
                    diff = "".join(
                        difflib.unified_diff(
                            before.splitlines(keepends=True),
                            after.splitlines(keepends=True),
                            fromfile=f"a/{rel}",
                            tofile=f"b/{rel}",
                        )
                    )
                    diffs.append({"path": rel, "diff": diff})
                main = scratch / main_file
                if not main.exists():
                    return Projection(
                        errors=[
                            ProjectedError(
                                main_file, None, "Main ledger file is missing", "MissingFile"
                            )
                        ],
                        diffs=diffs,
                    )
                _entries, errors, _options = beancount_loader.load_file(str(main))
                out: list[ProjectedError] = []
                for err in errors:
                    source = getattr(err, "source", None) or {}
                    filename = str(source.get("filename", ""))
                    try:
                        filename = str(Path(filename).resolve().relative_to(scratch.resolve()))
                    except ValueError:
                        pass
                    out.append(
                        ProjectedError(
                            filename=filename,
                            lineno=source.get("lineno"),
                            message=str(getattr(err, "message", err)),
                            type=err.__class__.__name__,
                        )
                    )
                return Projection(errors=out, diffs=diffs)

        return await asyncio.to_thread(_project)

    # --------------------------------------------------------- file helpers
    def read_file(self, ledger_id: str, rel_path: str) -> tuple[str, str]:
        paths = self.paths(ledger_id)
        target = safe_relative_path(paths.repo, rel_path)
        if not target.exists() or not target.is_file():
            raise NotFoundError(f"File not found: {rel_path}")
        try:
            text = target.read_text("utf-8")
        except UnicodeDecodeError as exc:
            raise LedgerError(f"{rel_path} is not a UTF-8 text file") from exc
        return text, sha256_text(text)

    def write_file(
        self, ledger_id: str, rel_path: str, content: str, expected_sha: str | None = None
    ) -> str:
        paths = self.paths(ledger_id)
        target = safe_relative_path(paths.repo, rel_path)
        if expected_sha is not None and target.exists():
            current = target.read_text("utf-8")
            if sha256_text(current) != expected_sha:
                raise LedgerError(
                    "The file changed since you opened it. Reload and reapply your edit.",
                    details={"code": "stale_file"},
                )
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return sha256_text(content)

    def write_bytes(self, ledger_id: str, rel_path: str, data: bytes) -> None:
        paths = self.paths(ledger_id)
        target = safe_relative_path(paths.repo, rel_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    def delete_file(self, ledger_id: str, rel_path: str) -> None:
        paths = self.paths(ledger_id)
        target = safe_relative_path(paths.repo, rel_path)
        if not target.exists():
            raise NotFoundError(f"File not found: {rel_path}")
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()

    def rename_file(self, ledger_id: str, old_path: str, new_path: str) -> None:
        paths = self.paths(ledger_id)
        source = safe_relative_path(paths.repo, old_path)
        target = safe_relative_path(paths.repo, new_path)
        if not source.exists():
            raise NotFoundError(f"File not found: {old_path}")
        if target.exists():
            raise LedgerError(f"{new_path} already exists")
        target.parent.mkdir(parents=True, exist_ok=True)
        source.rename(target)

    def list_dir(self, ledger_id: str, rel_dir: str = "") -> list[dict[str, Any]]:
        paths = self.paths(ledger_id)
        base = safe_relative_path(paths.repo, rel_dir) if rel_dir else paths.repo
        if not base.exists() or not base.is_dir():
            raise NotFoundError(f"Directory not found: {rel_dir}")
        entries: list[dict[str, Any]] = []
        for child in sorted(base.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
            if child.name in _IGNORED_DIRS:
                continue
            rel = child.relative_to(paths.repo).as_posix()
            stat = child.stat()
            entries.append(
                {
                    "name": child.name,
                    "path": rel,
                    "type": "dir" if child.is_dir() else "file",
                    "size": stat.st_size if child.is_file() else 0,
                    "modifiedAt": dt.datetime.fromtimestamp(stat.st_mtime, tz=dt.UTC).isoformat(),
                }
            )
        return entries

    def repo_size(self, ledger_id: str) -> int:
        paths = self.paths(ledger_id)
        total = 0
        for child in paths.repo.rglob("*"):
            if ".git" in child.parts:
                continue
            if child.is_file():
                total += child.stat().st_size
        return total


_store: LedgerStore | None = None


def get_store() -> LedgerStore:
    global _store
    if _store is None:
        _store = LedgerStore()
    return _store
