"""Ledger files: browse, read, write, create, rename, delete, upload, check, format."""

from __future__ import annotations

import mimetypes
from typing import Any

from fastapi import APIRouter, File, Form, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.core.deps import LedgerReadDep, LedgerWriteDep, SettingsDep, author_for
from app.errors import NotFoundError, ValidationError
from app.ledgers import engine
from app.ledgers.store import get_store, is_text_path, safe_relative_path
from app.logging_setup import get_logger

log = get_logger(__name__)
router = APIRouter(prefix="/workspaces/{workspace}/ledgers/{slug}/files", tags=["files"])


@router.get("/tree")
async def tree(
    access: LedgerReadDep, path: str = Query(default=""), ref: str | None = Query(default=None)
):
    store = get_store()
    ledger = access.ledger
    if ref and ref != "HEAD":
        entries = await store.repo(ledger).ls_tree(ref, path)
        return {
            "path": path,
            "ref": ref,
            "entries": [e.__dict__ | {"last_commit": None} for e in entries],
        }
    entries = store.list_dir(ledger, path)
    repo = store.repo(ledger)
    out = []
    for entry in entries:
        last = await repo.last_commit_for(entry["path"])
        out.append({**entry, "lastCommit": last.to_dict() if last else None})
    return {"path": path, "ref": "HEAD", "entries": out}


@router.get("/content")
async def content(
    access: LedgerReadDep, path: str = Query(min_length=1), ref: str | None = Query(default=None)
):
    store = get_store()
    ledger = access.ledger
    target = safe_relative_path(store.paths(ledger).repo, path)
    if ref and ref != "HEAD":
        data = await store.repo(ledger).read_blob(ref, path)
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            return {"path": path, "ref": ref, "binary": True, "size": len(data)}
        return {
            "path": path,
            "ref": ref,
            "binary": False,
            "content": text,
            "sha256sum": None,
            "size": len(data),
        }
    if not target.exists() or not target.is_file():
        raise NotFoundError(f"File not found: {path}")
    if not is_text_path(target):
        try:
            text = target.read_text("utf-8")
        except UnicodeDecodeError:
            return {"path": path, "ref": "HEAD", "binary": True, "size": target.stat().st_size}
    text, sha = store.read_file(ledger, path)
    last = await store.repo(ledger).last_commit_for(path)
    return {
        "path": path,
        "ref": "HEAD",
        "binary": False,
        "content": text,
        "sha256sum": sha,
        "size": len(text.encode("utf-8")),
        "lastCommit": last.to_dict() if last else None,
    }


@router.get("/raw")
async def raw(access: LedgerReadDep, path: str = Query(min_length=1)):
    """Serve a file (documents, receipts) with its content type."""
    store = get_store()
    target = safe_relative_path(store.paths(access.ledger).repo, path)
    if not target.exists() or not target.is_file():
        raise NotFoundError(f"File not found: {path}")
    media_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    return FileResponse(target, media_type=media_type, filename=target.name)


class WriteFileRequest(BaseModel):
    path: str = Field(min_length=1)
    content: str
    sha256sum: str | None = None
    message: str | None = None


@router.put("/content")
async def write(body: WriteFileRequest, access: LedgerWriteDep):
    store = get_store()
    ledger = access.ledger
    async with store.write_lock(ledger):
        sha = store.write_file(ledger, body.path, body.content, body.sha256sum)
        commit = await store.commit(
            ledger, body.message or f"Update {body.path}", author_for(access.auth.user)
        )
        errors = await store.run(ledger, engine.errors)
    return {"path": body.path, "sha256sum": sha, "commit": commit, "errors": errors}


class CreateFileRequest(BaseModel):
    path: str = Field(min_length=1)
    content: str = ""
    message: str | None = None


@router.post("", status_code=201)
async def create(body: CreateFileRequest, access: LedgerWriteDep):
    store = get_store()
    ledger = access.ledger
    target = safe_relative_path(store.paths(ledger).repo, body.path)
    if target.exists():
        raise ValidationError(f"{body.path} already exists")
    async with store.write_lock(ledger):
        sha = store.write_file(ledger, body.path, body.content)
        commit = await store.commit(
            ledger, body.message or f"Create {body.path}", author_for(access.auth.user)
        )
    return {"path": body.path, "sha256sum": sha, "commit": commit}


class RenameRequest(BaseModel):
    old_path: str = Field(alias="oldPath", min_length=1)
    new_path: str = Field(alias="newPath", min_length=1)
    message: str | None = None


@router.post("/rename")
async def rename(body: RenameRequest, access: LedgerWriteDep):
    store = get_store()
    ledger = access.ledger
    async with store.write_lock(ledger):
        store.rename_file(ledger, body.old_path, body.new_path)
        commit = await store.commit(
            ledger,
            body.message or f"Rename {body.old_path} to {body.new_path}",
            author_for(access.auth.user),
        )
    return {"path": body.new_path, "commit": commit}


class DeleteRequest(BaseModel):
    path: str = Field(min_length=1)
    message: str | None = None


@router.delete("")
async def delete(body: DeleteRequest, access: LedgerWriteDep):
    store = get_store()
    ledger = access.ledger
    if body.path == ledger.main_file:
        raise ValidationError("The main ledger file cannot be deleted")
    async with store.write_lock(ledger):
        store.delete_file(ledger, body.path)
        commit = await store.commit(
            ledger, body.message or f"Delete {body.path}", author_for(access.auth.user)
        )
    return {"deleted": body.path, "commit": commit}


@router.post("/upload", status_code=201)
async def upload(
    access: LedgerWriteDep,
    settings: SettingsDep,
    files: list[UploadFile] = File(...),
    directory: str = Form(default=""),
    message: str | None = Form(default=None),
):
    store = get_store()
    ledger = access.ledger
    written: list[str] = []
    async with store.write_lock(ledger):
        for upload_file in files:
            name = (upload_file.filename or "upload").replace("\\", "/").split("/")[-1]
            data = await upload_file.read()
            if len(data) > settings.max_upload_bytes:
                raise ValidationError(f"{name} exceeds the upload limit")
            rel = f"{directory.strip('/')}/{name}" if directory.strip("/") else name
            store.write_bytes(ledger, rel, data)
            written.append(rel)
        commit = await store.commit(
            ledger, message or f"Upload {', '.join(written)}", author_for(access.auth.user)
        )
    return {"files": written, "commit": commit}


class CheckRequest(BaseModel):
    changes: dict[str, str | None] = Field(
        default_factory=dict, description="path -> new content (null deletes)"
    )


@router.post("/check")
async def check(body: CheckRequest, access: LedgerReadDep):
    """Validate a projected set of file changes without committing them."""
    store = get_store()
    ledger = access.ledger
    projection = await store.project(ledger, body.changes)
    return projection.to_dict()


class FormatRequest(BaseModel):
    source: str


@router.post("/format")
async def format_source(body: FormatRequest, access: LedgerReadDep):
    formatted = await get_store().run(
        access.ledger, lambda fava: engine.format_source(fava, body.source)
    )
    return {"source": formatted}


def _dict(entry: Any) -> dict[str, Any]:
    return dict(entry)
