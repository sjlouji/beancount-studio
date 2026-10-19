"""Temporary uploads (receipts, statements) owned by a user."""

from __future__ import annotations

import mimetypes

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import FileResponse

from app.core.deps import DbDep, SettingsDep, UserDep
from app.db.models import Upload
from app.errors import NotFoundError, ValidationError
from app.logging_setup import get_logger
from app.storage import get_storage

log = get_logger(__name__)
router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("", status_code=201)
async def create_upload(
    user: UserDep, db: DbDep, settings: SettingsDep, file: UploadFile = File(...)
):
    data = await file.read()
    if not data:
        raise ValidationError("The file is empty")
    if len(data) > settings.max_upload_bytes:
        raise ValidationError("File exceeds the upload limit")
    name = (file.filename or "upload").replace("\\", "/").split("/")[-1]
    mime = file.content_type or mimetypes.guess_type(name)[0] or "application/octet-stream"
    upload = Upload(user_id=user.id, filename=name, mime_type=mime, size=len(data))
    db.add(upload)
    await db.flush()
    get_storage().upload_path(upload.id, upload.filename).write_bytes(data)
    await db.commit()
    return {
        "id": upload.id,
        "filename": upload.filename,
        "mimeType": upload.mime_type,
        "size": upload.size,
    }


@router.get("/{upload_id}")
async def get_upload(upload_id: str, user: UserDep, db: DbDep):
    upload = await db.get(Upload, upload_id)
    if upload is None or upload.user_id != user.id:
        raise NotFoundError("Upload not found")
    path = get_storage().upload_path(upload.id, upload.filename)
    if not path.exists():
        raise NotFoundError("Upload file is missing")
    return FileResponse(path, media_type=upload.mime_type, filename=upload.filename)


async def load_upload(db, user, upload_id: str) -> tuple[Upload, bytes]:
    upload = await db.get(Upload, upload_id)
    if upload is None or upload.user_id != user.id:
        raise NotFoundError("Upload not found")
    path = get_storage().upload_path(upload.id, upload.filename)
    if not path.exists():
        raise NotFoundError("Upload file is missing")
    return upload, path.read_bytes()
