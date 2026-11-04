"""The assistant's model connection that an admin makes in the app: a local Ollama server.

The environment (`BS_AI_*`, `BS_ANTHROPIC_*`, `BS_OPENAI_*`) holds the default provider. A
connection stored in `instance_settings` under `ai.ollama` is laid over it per request
(`effective_settings`), so it takes effect without a restart and wins over the environment
until it is removed. Ollama is spoken to through its OpenAI-compatible `/v1` API, so the
existing `OpenAICompatibleProvider` serves it unchanged.
"""

from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import urlparse

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.db.models import InstanceSetting
from app.errors import AppError, ValidationError
from app.logging_setup import get_logger

log = get_logger(__name__)

OLLAMA_KEY = "ai.ollama"
# Where Ollama usually answers: on this machine, from inside Docker on the host, or as a
# compose service named `ollama`.
OLLAMA_CANDIDATES = (
    "http://localhost:11434",
    "http://127.0.0.1:11434",
    "http://host.docker.internal:11434",
    "http://ollama:11434",
)
PROBE_TIMEOUT_SECONDS = 3.0
MAX_URL_LENGTH = 255

# Tests replace this to talk to a fake Ollama.
transport: httpx.AsyncBaseTransport | None = None


class OllamaUnreachableError(AppError):
    status_code = 502
    code = "ollama_unreachable"


def normalise_base_url(raw: str) -> str:
    """An Ollama server's base URL as stored: http(s), no trailing slash, no `/v1` or `/api`."""
    url = (raw or "").strip().rstrip("/")
    for suffix in ("/v1", "/api"):
        if url.endswith(suffix):
            url = url[: -len(suffix)]
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or len(url) > MAX_URL_LENGTH:
        raise ValidationError("Enter the Ollama server's address, such as http://localhost:11434")
    return url


async def list_models(base_url: str) -> list[dict[str, Any]]:
    """The models an Ollama server has pulled (`GET /api/tags`), newest first."""
    url = normalise_base_url(base_url)
    try:
        async with httpx.AsyncClient(timeout=PROBE_TIMEOUT_SECONDS, transport=transport) as client:
            response = await client.get(f"{url}/api/tags")
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("ollama at %s did not answer: %s", url, exc)
        raise OllamaUnreachableError(
            f"No Ollama server answered at {url}. Start Ollama (`ollama serve`) or check the address.",
            details={"baseUrl": url},
        ) from exc
    models = payload.get("models") if isinstance(payload, dict) else None
    if not isinstance(models, list):
        raise OllamaUnreachableError(
            f"{url} answered, but not as an Ollama server.", details={"baseUrl": url}
        )
    rows = []
    for model in models:
        if not isinstance(model, dict) or not model.get("name"):
            continue
        info = model.get("details") if isinstance(model.get("details"), dict) else {}
        rows.append(
            {
                "name": str(model["name"]),
                "size": int(model.get("size") or 0),
                "family": info.get("family") or None,
                "parameterSize": info.get("parameter_size") or None,
                "modifiedAt": model.get("modified_at") or None,
            }
        )
    capabilities = await _capabilities(url, [row["name"] for row in rows])
    for row in rows:
        caps = capabilities.get(row["name"])
        row["capabilities"] = caps
        # The assistant is a tool-use agent: a model can chat here only if it calls tools. None
        # when the server doesn't say (Ollama before capabilities were reported).
        row["canChat"] = None if caps is None else "tools" in caps
    rows.sort(key=lambda row: row["modifiedAt"] or "", reverse=True)
    return rows


async def _capabilities(url: str, names: list[str]) -> dict[str, list[str] | None]:
    """Each model's capabilities from `POST /api/show` (completion, tools, vision, embedding…).

    A model whose details can't be read gets None rather than failing the listing: the list is
    still useful, and connecting checks the model again.
    """

    async def show(client: httpx.AsyncClient, name: str) -> tuple[str, list[str] | None]:
        try:
            response = await client.post(f"{url}/api/show", json={"model": name})
            response.raise_for_status()
            caps = response.json().get("capabilities")
        except (httpx.HTTPError, ValueError, AttributeError) as exc:
            log.warning("ollama at %s: could not read the capabilities of %s: %s", url, name, exc)
            return name, None
        return name, [str(cap) for cap in caps] if isinstance(caps, list) else None

    async with httpx.AsyncClient(timeout=PROBE_TIMEOUT_SECONDS, transport=transport) as client:
        return dict(await asyncio.gather(*(show(client, name) for name in names)))


async def detect() -> dict[str, Any] | None:
    """The first usual address where an Ollama server answers, with its models; None when none does."""

    async def probe(url: str) -> dict[str, Any] | None:
        try:
            return {"baseUrl": url, "models": await list_models(url)}
        except OllamaUnreachableError:
            return None

    for found in await asyncio.gather(*(probe(url) for url in OLLAMA_CANDIDATES)):
        if found is not None:
            return found
    return None


async def stored_ollama(db: AsyncSession) -> dict[str, str] | None:
    row = await db.get(InstanceSetting, OLLAMA_KEY)
    value = row.value if row is not None else None
    if not isinstance(value, dict) or not value.get("baseUrl") or not value.get("model"):
        return None
    return {"baseUrl": str(value["baseUrl"]), "model": str(value["model"])}


async def save_ollama(
    db: AsyncSession, *, base_url: str, model: str, user_id: str
) -> dict[str, str]:
    """Stores the connection once the server answers and has the model."""
    url = normalise_base_url(base_url)
    model = (model or "").strip()
    if not model:
        raise ValidationError("Choose a model")
    rows = {row["name"]: row for row in await list_models(url)}
    if model not in rows:
        raise ValidationError(
            f"Ollama at {url} has no model '{model}'. Pull it first (`ollama pull {model}`).",
            details={"models": sorted(rows)},
        )
    if rows[model]["canChat"] is False:
        raise ValidationError(
            f"'{model}' can't run the assistant: it doesn't call tools. Choose a chat model such as "
            "qwen3, llama3.1 or mistral.",
            details={"capabilities": rows[model]["capabilities"]},
        )
    value = {"baseUrl": url, "model": model}
    row = await db.get(InstanceSetting, OLLAMA_KEY)
    if row is None:
        db.add(InstanceSetting(key=OLLAMA_KEY, value=value, updated_by_id=user_id))
    else:
        row.value = value
        row.updated_by_id = user_id
    await db.commit()
    log.info("assistant connected to ollama %s model %s", url, model)
    return value


async def remove_ollama(db: AsyncSession) -> None:
    row = await db.get(InstanceSetting, OLLAMA_KEY)
    if row is not None:
        await db.delete(row)
        await db.commit()
        log.info("assistant disconnected from ollama")


def with_ollama(settings: Settings, connection: dict[str, str] | None) -> Settings:
    """The settings with the Ollama connection laid over the environment's provider."""
    if connection is None:
        return settings
    return settings.model_copy(
        update={
            "ai_provider": "openai",
            "openai_base_url": f"{connection['baseUrl']}/v1",
            "openai_api_key": "ollama",
            "ai_model": connection["model"],
            "ai_fast_model": "",
        }
    )


async def effective_settings(db: AsyncSession, settings: Settings) -> Settings:
    return with_ollama(settings, await stored_ollama(db))
