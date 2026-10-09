"""Health and instance information."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import func, select

from app import __version__
from app.core.deps import DbDep, SettingsDep
from app.db.models import User
from app.schemas import SystemInfo

router = APIRouter(tags=["system"])


@router.get("/healthz")
async def healthz():
    return {"ok": True}


@router.get("/system/info", response_model=SystemInfo)
async def system_info(db: DbDep, settings: SettingsDep):
    count = (await db.execute(select(func.count(User.id)))).scalar_one()
    return SystemInfo(
        app_name=settings.app_name,
        version=__version__,
        ai_enabled=settings.ai_enabled,
        email_enabled=settings.email_enabled,
        signup_enabled=settings.allow_signup or count == 0,
        has_users=count > 0,
    )
