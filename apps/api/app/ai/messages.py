"""Conversions between assistant-ui's wire format (AI SDK LanguageModelV2 messages) and
Anthropic Messages API content, plus the persisted thread format (assistant-ui ThreadMessageLike).
"""

from __future__ import annotations

import base64
import json
import re
from typing import Any

from app.logging_setup import get_logger

log = get_logger(__name__)

_DATA_URL = re.compile(r"^data:([^;,]+)(;base64)?,(.*)$", re.S)
IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
TEXT_TYPES_PREFIX = ("text/", "application/json", "application/csv")


def _decode_data_url(data: str) -> tuple[str | None, bytes | None]:
    match = _DATA_URL.match(data)
    if not match:
        return None, None
    media, is_b64, payload = match.group(1), match.group(2), match.group(3)
    try:
        raw = base64.b64decode(payload) if is_b64 else payload.encode("utf-8")
    except ValueError:
        return media, None
    return media, raw


def file_part_to_block(part: dict[str, Any]) -> dict[str, Any] | None:
    """Turn an AI SDK file part into an Anthropic content block (image, document, or text)."""
    data = part.get("data")
    media_type = (
        part.get("mediaType") or part.get("mimeType") or "application/octet-stream"
    ).lower()
    filename = part.get("filename") or "attachment"
    if not isinstance(data, str):
        return None
    if data.startswith("data:"):
        media_from_url, raw = _decode_data_url(data)
        media_type = media_from_url or media_type
        if raw is None:
            return None
        b64 = base64.b64encode(raw).decode("ascii")
    elif data.startswith("http://") or data.startswith("https://"):
        if media_type in IMAGE_TYPES:
            return {"type": "image", "source": {"type": "url", "url": data}}
        if media_type == "application/pdf":
            return {"type": "document", "source": {"type": "url", "url": data}, "title": filename}
        return {"type": "text", "text": f"[Attachment {filename} at {data}]"}
    else:
        b64 = data
        try:
            raw = base64.b64decode(data)
        except ValueError:
            raw = b""
    if media_type in IMAGE_TYPES:
        return {
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": b64},
        }
    if media_type == "application/pdf":
        return {
            "type": "document",
            "source": {"type": "base64", "media_type": "application/pdf", "data": b64},
            "title": filename,
        }
    if media_type.startswith(TEXT_TYPES_PREFIX) or filename.lower().endswith(
        (".csv", ".txt", ".bean", ".beancount", ".qif", ".ofx", ".json", ".md")
    ):
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("latin-1", "replace")
        return {
            "type": "text",
            "text": f'<attachment filename="{filename}">\n{text[:200_000]}\n</attachment>',
        }
    return {"type": "text", "text": f"[Unsupported attachment type {media_type}: {filename}]"}


def to_anthropic_messages(
    messages: list[dict[str, Any]],
    raw_assistant_turns: dict[str, list[dict[str, Any]]] | None = None,
) -> tuple[list[str], list[dict[str, Any]]]:
    """Convert LanguageModelV2 messages to Anthropic messages.

    `raw_assistant_turns` maps a toolCallId to the exact assistant content blocks the API
    produced (including thinking blocks). When an incoming assistant message references one of
    those ids, the stored blocks are used verbatim so the conversation stays append-only.
    """
    systems: list[str] = []
    out: list[dict[str, Any]] = []
    raw_assistant_turns = raw_assistant_turns or {}
    for message in messages:
        role = message.get("role")
        content = message.get("content")
        if role == "system":
            if isinstance(content, str) and content.strip():
                systems.append(content)
            continue
        if role == "user":
            blocks: list[dict[str, Any]] = []
            if isinstance(content, str):
                blocks.append({"type": "text", "text": content})
            else:
                for part in content or []:
                    if part.get("type") == "text" and part.get("text"):
                        blocks.append({"type": "text", "text": part["text"]})
                    elif part.get("type") == "file":
                        block = file_part_to_block(part)
                        if block:
                            blocks.append(block)
            if blocks:
                out.append({"role": "user", "content": blocks})
            continue
        if role == "assistant":
            raw_blocks = None
            for part in content or []:
                if (
                    part.get("type") == "tool-call"
                    and part.get("toolCallId") in raw_assistant_turns
                ):
                    raw_blocks = raw_assistant_turns[part["toolCallId"]]
                    break
            if raw_blocks is not None:
                out.append({"role": "assistant", "content": raw_blocks})
                continue
            blocks = []
            for part in content or []:
                if part.get("type") == "text" and part.get("text"):
                    blocks.append({"type": "text", "text": part["text"]})
                elif part.get("type") == "tool-call":
                    blocks.append(
                        {
                            "type": "tool_use",
                            "id": part["toolCallId"],
                            "name": part["toolName"],
                            "input": part.get("input")
                            if isinstance(part.get("input"), dict)
                            else (part.get("args") or {}),
                        }
                    )
            if blocks:
                out.append({"role": "assistant", "content": blocks})
            continue
        if role == "tool":
            blocks = []
            for part in content or []:
                if part.get("type") != "tool-result":
                    continue
                output = part.get("output") or {}
                is_error = output.get("type") in ("error-json", "error-text")
                value = output.get("value", part.get("result"))
                text = (
                    value
                    if isinstance(value, str)
                    else json.dumps(value, ensure_ascii=False, default=str)
                )
                blocks.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": part["toolCallId"],
                        "content": text,
                        "is_error": bool(is_error),
                    }
                )
            if blocks:
                out.append({"role": "user", "content": blocks})
    # Anthropic requires alternating roles starting with user; merge consecutive same-role turns.
    merged: list[dict[str, Any]] = []
    for msg in out:
        if merged and merged[-1]["role"] == msg["role"]:
            merged[-1]["content"] = list(merged[-1]["content"]) + list(msg["content"])
        else:
            merged.append({"role": msg["role"], "content": list(msg["content"])})
    while merged and merged[0]["role"] != "user":
        merged.pop(0)
    return systems, merged


def last_user_message_for_history(messages: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The newest user message as an assistant-ui ThreadMessageLike (for persistence)."""
    for message in reversed(messages):
        if message.get("role") != "user":
            continue
        content = message.get("content")
        parts: list[dict[str, Any]] = []
        if isinstance(content, str):
            parts.append({"type": "text", "text": content})
        else:
            for part in content or []:
                if part.get("type") == "text":
                    parts.append({"type": "text", "text": part.get("text", "")})
                elif part.get("type") == "file":
                    media = (part.get("mediaType") or "application/octet-stream").lower()
                    data = part.get("data") if isinstance(part.get("data"), str) else ""
                    if media in IMAGE_TYPES:
                        parts.append(
                            {"type": "image", "image": data, "filename": part.get("filename")}
                        )
                    else:
                        parts.append(
                            {
                                "type": "file",
                                "data": data,
                                "mimeType": media,
                                "filename": part.get("filename"),
                            }
                        )
        return {"role": "user", "content": parts}
    return None


def ends_with_tool_result(messages: list[dict[str, Any]]) -> bool:
    return bool(messages) and messages[-1].get("role") == "tool"


def tool_results_in_last_message(messages: list[dict[str, Any]]) -> dict[str, Any]:
    """toolCallId -> result value for the trailing tool message (used to persist approvals)."""
    if not ends_with_tool_result(messages):
        return {}
    results = {}
    for part in messages[-1].get("content") or []:
        if part.get("type") == "tool-result":
            output = part.get("output") or {}
            results[part["toolCallId"]] = output.get("value", part.get("result"))
    return results


# ------------------------------------------------------------ OpenAI-compatible


def file_part_to_openai(part: dict[str, Any]) -> dict[str, Any] | None:
    """Turn an AI SDK file part into an OpenAI chat content part (image_url or text)."""
    data = part.get("data")
    media_type = (
        part.get("mediaType") or part.get("mimeType") or "application/octet-stream"
    ).lower()
    filename = part.get("filename") or "attachment"
    if not isinstance(data, str):
        return None
    if data.startswith(("http://", "https://")):
        if media_type in IMAGE_TYPES:
            return {"type": "image_url", "image_url": {"url": data}}
        return {"type": "text", "text": f"[Attachment {filename} at {data}]"}
    if data.startswith("data:"):
        media_from_url, raw = _decode_data_url(data)
        media_type = media_from_url or media_type
        if media_type in IMAGE_TYPES:
            return {"type": "image_url", "image_url": {"url": data}}
    else:
        try:
            raw = base64.b64decode(data)
        except ValueError:
            raw = None
        if media_type in IMAGE_TYPES:
            return {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{data}"}}
    if raw is None:
        return None
    if media_type.startswith(TEXT_TYPES_PREFIX) or filename.lower().endswith(
        (".csv", ".txt", ".bean", ".beancount", ".qif", ".ofx", ".json", ".md")
    ):
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("latin-1", "replace")
        return {
            "type": "text",
            "text": f'<attachment filename="{filename}">\n{text[:200_000]}\n</attachment>',
        }
    if media_type == "application/pdf":
        return {
            "type": "text",
            "text": f"[The user attached {filename} (PDF). This model server cannot read PDFs; ask for an image or the text.]",
        }
    return {"type": "text", "text": f"[Unsupported attachment type {media_type}: {filename}]"}


def to_openai_messages(
    messages: list[dict[str, Any]], raw_assistant_turns: dict[str, Any] | None = None
) -> tuple[list[str], list[dict[str, Any]]]:
    """Convert LanguageModelV2 messages to OpenAI chat-completions messages.

    `raw_assistant_turns` maps a toolCallId to the exact assistant message the server produced,
    replayed verbatim so tool-call ids and argument strings match what the model emitted.
    """
    systems: list[str] = []
    out: list[dict[str, Any]] = []
    raw_assistant_turns = raw_assistant_turns or {}
    for message in messages:
        role = message.get("role")
        content = message.get("content")
        if role == "system":
            if isinstance(content, str) and content.strip():
                systems.append(content)
            continue
        if role == "user":
            parts: list[dict[str, Any]] = []
            if isinstance(content, str):
                parts.append({"type": "text", "text": content})
            else:
                for part in content or []:
                    if part.get("type") == "text" and part.get("text"):
                        parts.append({"type": "text", "text": part["text"]})
                    elif part.get("type") == "file":
                        converted = file_part_to_openai(part)
                        if converted:
                            parts.append(converted)
            if parts:
                if all(p["type"] == "text" for p in parts):
                    out.append({"role": "user", "content": "\n\n".join(p["text"] for p in parts)})
                else:
                    out.append({"role": "user", "content": parts})
            continue
        if role == "assistant":
            raw = None
            for part in content or []:
                if (
                    part.get("type") == "tool-call"
                    and part.get("toolCallId") in raw_assistant_turns
                ):
                    raw = raw_assistant_turns[part["toolCallId"]]
                    break
            if isinstance(raw, dict):
                out.append(raw)
                continue
            text = "".join(p.get("text", "") for p in content or [] if p.get("type") == "text")
            tool_calls = []
            for part in content or []:
                if part.get("type") == "tool-call":
                    args = (
                        part.get("input")
                        if isinstance(part.get("input"), dict)
                        else (part.get("args") or {})
                    )
                    tool_calls.append(
                        {
                            "id": part["toolCallId"],
                            "type": "function",
                            "function": {
                                "name": part["toolName"],
                                "arguments": json.dumps(args, ensure_ascii=False),
                            },
                        }
                    )
            native: dict[str, Any] = {"role": "assistant", "content": text or None}
            if tool_calls:
                native["tool_calls"] = tool_calls
            if text or tool_calls:
                out.append(native)
            continue
        if role == "tool":
            for part in content or []:
                if part.get("type") != "tool-result":
                    continue
                output = part.get("output") or {}
                value = output.get("value", part.get("result"))
                text = (
                    value
                    if isinstance(value, str)
                    else json.dumps(value, ensure_ascii=False, default=str)
                )
                out.append({"role": "tool", "tool_call_id": part["toolCallId"], "content": text})
    while out and out[0]["role"] != "user":
        out.pop(0)
    return systems, out
