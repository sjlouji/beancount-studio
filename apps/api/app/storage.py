"""The product's own storage tree under BS_DATA_DIR.

Every path to data on disk is built here and nowhere else, so the layout can change (per-workspace
directories, usage accounting) without touching the modules that read and write files.

Layout today:
    <root>/ledgers/<ledger_id>/repo/   one git repository per ledger
    <root>/uploads/<upload_id><ext>    temporary uploads (receipts, statements)
    <root>/tmp/                        short-lived files handed to git (askpass helper, SSH keys)
    <root>/ssh/known_hosts             host keys of the git servers this instance has talked to
    <root>/studio.db                   SQLite database unless BS_DATABASE_URL points elsewhere
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings

_MAX_EXTENSION_LENGTH = 10


@dataclass(frozen=True)
class LedgerPaths:
    root: Path
    repo: Path
    main_file: Path


class Storage:
    def __init__(self, root: Path) -> None:
        self.root = root

    @property
    def ledgers_dir(self) -> Path:
        return self.root / "ledgers"

    @property
    def uploads_dir(self) -> Path:
        return self.root / "uploads"

    @property
    def tmp_dir(self) -> Path:
        return self.root / "tmp"

    @property
    def known_hosts(self) -> Path:
        return self.root / "ssh" / "known_hosts"

    def ensure_layout(self) -> None:
        for directory in (self.root, self.ledgers_dir, self.uploads_dir, self.known_hosts.parent):
            directory.mkdir(parents=True, exist_ok=True)
        # Only this process may read what git is handed here.
        self.tmp_dir.mkdir(parents=True, exist_ok=True)
        self.tmp_dir.chmod(0o700)

    def ledger_paths(self, ledger_id: str, main_file: str = "main.bean") -> LedgerPaths:
        if not ledger_id.isalnum():
            raise ValueError(f"ledger id must be alphanumeric, got {ledger_id!r}")
        root = self.ledgers_dir / ledger_id
        repo = root / "repo"
        return LedgerPaths(root=root, repo=repo, main_file=repo / main_file)

    def upload_path(self, upload_id: str, filename: str) -> Path:
        """Uploads are stored by id; only a short, lower-cased extension of the original name is kept."""
        extension = Path(filename).suffix.lower()[:_MAX_EXTENSION_LENGTH]
        return self.uploads_dir / f"{upload_id}{extension}"


def get_storage() -> Storage:
    return Storage(get_settings().data_dir)
