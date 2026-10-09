"""Beancount Studio API entrypoint."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import get_settings
from app.db.base import dispose_db, init_db
from app.errors import install_error_handlers
from app.logging_setup import configure_logging, get_logger
from app.routers import (
    api_keys,
    auth,
    chat,
    commits,
    entries,
    files,
    imports,
    ledgers,
    receipts,
    reports,
    system,
    uploads,
    users,
)

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    await init_db()
    log.info(
        "%s API %s ready (data dir %s, ai=%s)",
        settings.app_name,
        __version__,
        settings.data_dir,
        settings.ai_enabled,
    )
    yield
    await dispose_db()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=f"{settings.app_name} API",
        version=__version__,
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)
    for router in (
        system.router,
        auth.router,
        users.router,
        api_keys.router,
        ledgers.router,
        reports.router,
        entries.router,
        files.router,
        commits.router,
        imports.router,
        receipts.router,
        uploads.router,
        chat.router,
    ):
        app.include_router(router, prefix="/api")
    return app


app = create_app()
