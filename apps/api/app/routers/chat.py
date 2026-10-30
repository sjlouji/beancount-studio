"""Assistant chat endpoint (assistant-ui data stream protocol) and thread persistence."""

from __future__ import annotations

from typing import Any

from assistant_stream import create_run
from assistant_stream.serialization import DataStreamResponse
from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.ai.agent import AgentRun
from app.ai.messages import (
    ends_with_tool_result,
    last_user_message_for_history,
    tool_results_in_last_message,
)
from app.ai.providers import AI_DISABLED_MESSAGE
from app.ai.tools import approved_hashes_from_messages
from app.core.deps import DbDep, LedgerReadDep, SettingsDep, UserDep
from app.db.base import get_session_factory
from app.db.models import ChatThread
from app.errors import FeatureDisabledError, NotFoundError, ValidationError
from app.ledgers.store import get_store
from app.logging_setup import get_logger

log = get_logger(__name__)
router = APIRouter(prefix="/workspaces/{workspace}/ledgers/{slug}/chat", tags=["chat"])


class ThreadOut(BaseModel):
    id: str
    title: str
    created_at: Any = Field(alias="createdAt")
    updated_at: Any = Field(alias="updatedAt")
    messages: list[dict[str, Any]] | None = None

    model_config = ConfigDict(populate_by_name=True)


def _thread_out(thread: ChatThread, *, with_messages: bool = False) -> dict[str, Any]:
    out = {
        "id": thread.id,
        "title": thread.title,
        "createdAt": thread.created_at,
        "updatedAt": thread.updated_at,
    }
    if with_messages:
        payload = thread.messages or {}
        out["messages"] = payload.get("ui", []) if isinstance(payload, dict) else payload
    return out


@router.get("/threads")
async def list_threads(access: LedgerReadDep, user: UserDep, db: DbDep):
    rows = (
        (
            await db.execute(
                select(ChatThread)
                .where(ChatThread.ledger_id == access.ledger.id, ChatThread.user_id == user.id)
                .order_by(ChatThread.updated_at.desc())
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    return [_thread_out(t) for t in rows]


@router.post("/threads", status_code=201)
async def create_thread(access: LedgerReadDep, user: UserDep, db: DbDep):
    thread = ChatThread(ledger_id=access.ledger.id, user_id=user.id, messages={"ui": [], "raw": {}})
    db.add(thread)
    await db.commit()
    return _thread_out(thread, with_messages=True)


@router.get("/threads/{thread_id}")
async def get_thread(thread_id: str, access: LedgerReadDep, user: UserDep, db: DbDep):
    thread = await db.get(ChatThread, thread_id)
    if thread is None or thread.user_id != user.id or thread.ledger_id != access.ledger.id:
        raise NotFoundError("Thread not found")
    return _thread_out(thread, with_messages=True)


class ThreadUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


@router.patch("/threads/{thread_id}")
async def rename_thread(
    thread_id: str, body: ThreadUpdate, access: LedgerReadDep, user: UserDep, db: DbDep
):
    thread = await db.get(ChatThread, thread_id)
    if thread is None or thread.user_id != user.id or thread.ledger_id != access.ledger.id:
        raise NotFoundError("Thread not found")
    thread.title = body.title.strip()
    await db.commit()
    return _thread_out(thread)


@router.delete("/threads/{thread_id}", status_code=204)
async def delete_thread(thread_id: str, access: LedgerReadDep, user: UserDep, db: DbDep):
    thread = await db.get(ChatThread, thread_id)
    if thread is None or thread.user_id != user.id or thread.ledger_id != access.ledger.id:
        raise NotFoundError("Thread not found")
    await db.delete(thread)
    await db.commit()
    return None


def _title_from(messages: list[dict[str, Any]]) -> str:
    for message in messages:
        if message.get("role") == "user":
            content = message.get("content")
            text = (
                content
                if isinstance(content, str)
                else " ".join(p.get("text", "") for p in content or [] if p.get("type") == "text")
            )
            text = " ".join(text.split())
            if text:
                return text[:80]
    return "New conversation"


async def _persist(
    thread_id: str, user_id: str, request_messages: list[dict[str, Any]], run: AgentRun
) -> None:
    """Append this turn to the stored thread (append-only, including raw model blocks)."""
    factory = get_session_factory()
    async with factory() as db:
        thread = await db.get(ChatThread, thread_id)
        if thread is None or thread.user_id != user_id:
            return
        payload = dict(thread.messages or {})
        ui: list[dict[str, Any]] = list(payload.get("ui", []))
        raw: dict[str, Any] = dict(payload.get("raw", {}))
        if ends_with_tool_result(request_messages) and ui and ui[-1].get("role") == "assistant":
            results = tool_results_in_last_message(request_messages)
            last = dict(ui[-1])
            content = [dict(p) for p in last.get("content", [])]
            for part in content:
                if part.get("type") == "tool-call" and part.get("toolCallId") in results:
                    part["result"] = results[part["toolCallId"]]
            content.extend(run.parts)
            last["content"] = content
            ui[-1] = last
        else:
            user_message = last_user_message_for_history(request_messages)
            if user_message is not None:
                ui.append(user_message)
            ui.append({"role": "assistant", "content": run.parts})
        raw.update(run.new_raw_turns)
        thread.messages = {"ui": ui, "raw": raw}
        if thread.title == "New conversation":
            thread.title = _title_from(request_messages)
        await db.commit()


@router.post("")
async def chat(
    request: Request, access: LedgerReadDep, user: UserDep, db: DbDep, settings: SettingsDep
):
    if not settings.ai_enabled:
        raise FeatureDisabledError(AI_DISABLED_MESSAGE)
    body = await request.json()
    messages = body.get("messages")
    if not isinstance(messages, list) or not messages:
        raise ValidationError("messages must be a non-empty list")
    thread_id = body.get("threadId") if isinstance(body.get("threadId"), str) else None
    raw_turns: dict[str, list[dict[str, Any]]] = {}
    if thread_id:
        thread = await db.get(ChatThread, thread_id)
        if thread is None or thread.user_id != user.id or thread.ledger_id != access.ledger.id:
            raise NotFoundError("Thread not found")
        payload = thread.messages or {}
        raw_turns = dict(payload.get("raw", {})) if isinstance(payload, dict) else {}

    run = AgentRun(
        settings=settings,
        store=get_store(),
        access=access,
        request_messages=messages,
        frontend_tools=body.get("tools") if isinstance(body.get("tools"), dict) else None,
        extra_system=body.get("system") if isinstance(body.get("system"), str) else None,
        raw_turns=raw_turns,
        approved_hashes=approved_hashes_from_messages(messages),
    )

    async def callback(controller):
        try:
            await run.run(controller)
        finally:
            if thread_id and (run.parts or run.new_raw_turns):
                try:
                    await _persist(thread_id, user.id, messages, run)
                except Exception as exc:
                    log.error("persisting chat thread %s failed: %s", thread_id, exc, exc_info=exc)

    response = DataStreamResponse(create_run(callback))
    response.headers["x-vercel-ai-data-stream"] = "v1"
    # no-transform stops proxies (the Next.js rewrite, nginx, Caddy) from gzip-buffering the stream.
    response.headers["Cache-Control"] = "no-cache, no-transform"
    response.headers["X-Accel-Buffering"] = "no"
    return response
