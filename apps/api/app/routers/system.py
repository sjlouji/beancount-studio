"""Health and instance information, and the assistant's model connection."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import func, select

from app import __version__
from app.ai import connection
from app.config import Settings
from app.core.deps import AiSettingsDep, DbDep, InstanceAdminDep, SettingsDep
from app.db.models import User
from app.logging_setup import get_logger
from app.schemas import AiConnectionStatus, ConnectOllamaRequest, SystemInfo

log = get_logger(__name__)

router = APIRouter(tags=["system"])


@router.get("/healthz")
async def healthz():
    return {"ok": True}


@router.get("/system/info", response_model=SystemInfo)
async def system_info(db: DbDep, settings: AiSettingsDep):
    count = (await db.execute(select(func.count(User.id)))).scalar_one()
    return SystemInfo(
        app_name=settings.app_name,
        version=__version__,
        ai_enabled=settings.ai_enabled,
        ai_provider=settings.resolved_ai_provider,
        ai_model=settings.resolved_ai_model or None,
        email_enabled=settings.email_enabled,
        signup_enabled=settings.allow_signup or count == 0,
        has_users=count > 0,
    )


async def _status(db: DbDep, settings: Settings) -> AiConnectionStatus:
    """The provider in effect, the stored connection, and the Ollama server it can reach.

    With a connection, its server is listed (to switch models); without one, the usual addresses
    are probed. An unreachable server leaves `detected` empty: the page says so and offers a retry.
    """
    stored = await connection.stored_ollama(db)
    effective = connection.with_ollama(settings, stored)
    if stored is not None:
        try:
            detected = {
                "baseUrl": stored["baseUrl"],
                "models": await connection.list_models(stored["baseUrl"]),
            }
        except connection.OllamaUnreachableError as exc:
            log.warning("connected ollama is unreachable: %s", exc)
            detected = None
    else:
        detected = await connection.detect()
    return AiConnectionStatus(
        provider=effective.resolved_ai_provider,
        model=effective.resolved_ai_model or None,
        connection=stored,
        detected=detected,
        environment_provider=settings.resolved_ai_provider,
    )


@router.get("/system/ai", response_model=AiConnectionStatus)
async def ai_status(_admin: InstanceAdminDep, db: DbDep, settings: SettingsDep):
    return await _status(db, settings)


@router.put("/system/ai/ollama", response_model=AiConnectionStatus)
async def connect_ollama(
    body: ConnectOllamaRequest, admin: InstanceAdminDep, db: DbDep, settings: SettingsDep
):
    await connection.save_ollama(db, base_url=body.base_url, model=body.model, user_id=admin.id)
    return await _status(db, settings)


@router.delete("/system/ai/ollama", response_model=AiConnectionStatus)
async def disconnect_ollama(_admin: InstanceAdminDep, db: DbDep, settings: SettingsDep):
    await connection.remove_ollama(db)
    return await _status(db, settings)
