"""Receipt / invoice extraction with vision, returning a proposed transaction."""

from __future__ import annotations

import base64
from typing import Any

from app.ai.providers import ProviderError, get_provider
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
    provider = get_provider(settings)
    b64 = base64.b64encode(data).decode("ascii")
    if mime_type in IMAGE_TYPES:
        file_part: dict[str, Any] = {"type": "image", "media_type": mime_type, "data": b64}
    elif mime_type == "application/pdf":
        file_part = {"type": "pdf", "data": b64, "filename": filename}
    else:
        raise ValidationError("Receipts must be an image (JPEG, PNG, WEBP, GIF) or a PDF")
    expense_accounts = [a for a in accounts if a.startswith("Expenses")]
    payment_accounts = [a for a in accounts if a.startswith(("Assets", "Liabilities"))]
    prompt = (
        "Extract this receipt or invoice into one transaction. Pick the expense account and the most "
        "plausible payment account from the lists below (exact names). Use the receipt's currency; if "
        f"none is printed, use {currencies[0] if currencies else 'USD'}. Keep narration short (what was bought).\n\n"
        "Expense accounts:\n"
        + "\n".join(expense_accounts)
        + "\n\nPayment accounts:\n"
        + "\n".join(payment_accounts)
    )
    try:
        parsed = await provider.generate_json(
            model=settings.resolved_ai_fast_model,
            system="You extract structured transactions from receipts. Return only JSON matching the schema.",
            parts=[file_part, {"type": "text", "text": prompt}],
            schema=_RECEIPT_SCHEMA,
        )
    except ProviderError as exc:
        log.error("receipt extraction failed (%s): %s", exc.kind, exc.message)
        raise LedgerError(f"Receipt extraction failed: {exc.user_message}") from exc
    if parsed.get("expenseAccount") not in accounts and expense_accounts:
        parsed["expenseAccount"] = expense_accounts[0]
    if parsed.get("paymentAccount") not in accounts and payment_accounts:
        parsed["paymentAccount"] = payment_accounts[0]
    return parsed
