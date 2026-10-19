from __future__ import annotations

from pathlib import Path

import pytest

from app.storage import Storage


def test_ensure_layout_creates_directories_and_is_idempotent(tmp_path: Path):
    storage = Storage(tmp_path / "data")
    storage.ensure_layout()
    storage.ensure_layout()
    assert storage.ledgers_dir.is_dir()
    assert storage.uploads_dir.is_dir()


def test_ledger_paths_follow_the_layout(tmp_path: Path):
    paths = Storage(tmp_path).ledger_paths("abc123", "books.bean")
    assert paths.root == tmp_path / "ledgers" / "abc123"
    assert paths.repo == tmp_path / "ledgers" / "abc123" / "repo"
    assert paths.main_file == tmp_path / "ledgers" / "abc123" / "repo" / "books.bean"


def test_ledger_id_must_be_a_plain_identifier(tmp_path: Path):
    with pytest.raises(ValueError):
        Storage(tmp_path).ledger_paths("../escape")


def test_upload_path_keeps_only_a_short_lowercase_extension(tmp_path: Path):
    storage = Storage(tmp_path)
    assert storage.upload_path("id1", "Receipt.PDF") == tmp_path / "uploads" / "id1.pdf"
    assert storage.upload_path("id2", "noext") == tmp_path / "uploads" / "id2"
    assert storage.upload_path("id3", "x.averyveryverylongextension").name == "id3.averyvery"
    assert storage.upload_path("id4", "../../etc/passwd.txt") == tmp_path / "uploads" / "id4.txt"
