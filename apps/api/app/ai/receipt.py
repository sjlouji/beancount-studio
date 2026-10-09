"""Receipt / invoice extraction with vision, returning a proposed transaction."""

from __future__ import annotations

import base64
import json
from typing import Any

import anthropic

from app.ai.client import get_client
from app.config import Settings
from app.errors import LedgerError, ValidationError
from app.logging_setup import get_logger

log = get_logger(__name__)

IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}

_RECEIPT_SCHEMA = {
    "type": "object",
    "properties": {
        "date": {"type": "string", "description": "YYYY-MM-DD"},
        "payee": {"type": "string"},
        "narration": {"type": "string"},
        "total": {"type": "number"},
        "currency": {"type": "string"},
        "tax": {"type": ["number", "null"]},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"description": {"type": "string"}, "amount": {"type": "number"}},
                "required": ["description", "amount"],
                "additionalProperties": False,
            },
        },
        "expenseAccount": {"type": "string"},
        "paymentAccount": {"type": "string"},
        "confidence": {"type": "number"},
        "notes": {"type": "string"},
    },
    "required": [
        "date",
        "payee",
        "narration",
        "total",
        "currency",
        "tax",
        "items",
        "expenseAccount",
        "paymentAccount",
        "confidence",
        "notes",
    ],
    "additionalProperties": False,
}


async def parse_receipt(
    settings: Settings,
    *,
    data: bytes,
    mime_type: str,
    filename: str,
    accounts: list[str],
    currencies: list[str],
) -> dict[str, Any]:
    client = get_client(settings)
    b64 = base64.b64encode(data).decode("ascii")
    if mime_type in IMAGE_TYPES:
        file_block: dict[str, Any] = {
            "type": "image",
            "source": {"type": "base64", "media_type": mime_type, "data": b64},
        }
    elif mime_type == "application/pdf":
        file_block = {
            "type": "document",
            "source": {"type": "base64", "media_type": "application/pdf", "data": b64},
            "title": filename,
        }
    else:
        raise ValidationError("Receipts must be an image (JPEG, PNG, WEBP, GIF) or a PDF")
    expense_accounts = [a for a in accounts if a.startswith("Expenses")]
    payment_accounts = [a for a in accounts if a.startswith(("Assets", "Liabilities"))]
    prompt = (
        "Extract this receipt or invoice into one transaction. Pick the expense account and the most plausible payment account "
        "from the lists below (exact names). Use the receipt's currency; if none is printed, use "
        f"{currencies[0] if currencies else 'USD'}. Keep narration short (what was bought).\n\n"
        "Expense accounts:\n"
        + "\n".join(expense_accounts)
        + "\n\nPayment accounts:\n"
        + "\n".join(payment_accounts)
    )
    try:
        response = await client.messages.create(
            model=settings.ai_fast_model,
            max_tokens=16000,
            messages=[{"role": "user", "content": [file_block, {"type": "text", "text": prompt}]}],
            output_config={
                "effort": "low",
                "format": {"type": "json_schema", "schema": _RECEIPT_SCHEMA},
            },
        )
    except anthropic.APIStatusError as exc:
        log.error("receipt extraction failed (%s): %s", exc.status_code, exc.message)
        raise LedgerError(f"Receipt extraction failed: {exc.message}") from exc
    except anthropic.APIConnectionError as exc:
        log.error("receipt extraction connection error: %s", exc)
        raise LedgerError("Could not reach the AI provider") from exc
    if response.stop_reason == "refusal":
        raise LedgerError("The model declined to read this file")
    text = next((b.text for b in response.content if b.type == "text"), "{}")
    parsed = json.loads(text)
    if parsed.get("expenseAccount") not in accounts and expense_accounts:
        parsed["expenseAccount"] = expense_accounts[0]
    if parsed.get("paymentAccount") not in accounts and payment_accounts:
        parsed["paymentAccount"] = payment_accounts[0]
    return parsed
