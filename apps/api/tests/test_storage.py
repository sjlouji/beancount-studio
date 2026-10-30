from __future__ import annotations

from pathlib import Path

import pytest

from app.storage import Storage


def test_ensure_layout_creates_directories_and_is_idempotent(tmp_path: Path):
    storage = Storage(tmp_path / "data")
    storage.ensure_layout()
    storage.ensure_layout()
    assert storage.workspaces_dir.is_dir()
    assert storage.uploads_dir.is_dir()


def test_ledger_paths_follow_the_layout(tmp_path: Path):
    paths = Storage(tmp_path).ledger_paths("ws1", "abc123", "books.bean")
    workspace = tmp_path / "workspaces" / "ws1"
    assert Storage(tmp_path).workspace_dir("ws1") == workspace
    assert paths.root == workspace / "ledgers" / "abc123"
    assert paths.repo == workspace / "ledgers" / "abc123" / "repo"
    assert paths.main_file == workspace / "ledgers" / "abc123" / "repo" / "books.bean"


def test_ids_must_be_plain_identifiers(tmp_path: Path):
    with pytest.raises(ValueError):
        Storage(tmp_path).ledger_paths("ws1", "../escape")
    with pytest.raises(ValueError):
        Storage(tmp_path).ledger_paths("../escape", "abc123")
    with pytest.raises(ValueError):
        Storage(tmp_path).workspace_dir("ws/1")


def test_upload_path_keeps_only_a_short_lowercase_extension(tmp_path: Path):
    storage = Storage(tmp_path)
    assert storage.upload_path("id1", "Receipt.PDF") == tmp_path / "uploads" / "id1.pdf"
    assert storage.upload_path("id2", "noext") == tmp_path / "uploads" / "id2"
    assert storage.upload_path("id3", "x.averyveryverylongextension").name == "id3.averyvery"
    assert storage.upload_path("id4", "../../etc/passwd.txt") == tmp_path / "uploads" / "id4.txt"
