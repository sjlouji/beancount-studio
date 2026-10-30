"""Receipt capture: parse an uploaded receipt with vision, then insert the transaction + file."""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from app.ai.providers import AI_DISABLED_MESSAGE
from app.ai.receipt import parse_receipt
from app.core.deps import DbDep, LedgerReadDep, LedgerWriteDep, SettingsDep, UserDep, author_for
from app.errors import FeatureDisabledError, ValidationError
from app.importers.csv_import import render_transaction
from app.ledgers import engine
from app.ledgers.store import get_store
from app.logging_setup import get_logger
from app.routers.uploads import load_upload

log = get_logger(__name__)
router = APIRouter(prefix="/workspaces/{workspace}/ledgers/{slug}/receipts", tags=["receipts"])


class ParseRequest(BaseModel):
    upload_id: str = Field(alias="uploadId")

    model_config = ConfigDict(populate_by_name=True)


@router.post("/parse")
async def parse(
    body: ParseRequest, access: LedgerReadDep, user: UserDep, db: DbDep, settings: SettingsDep
):
    if not settings.ai_enabled:
        raise FeatureDisabledError(
            f"Receipt scanning needs the AI assistant. {AI_DISABLED_MESSAGE}"
        )
    upload, data = await load_upload(db, user, body.upload_id)
    attrs = await get_store().run(access.ledger, engine.attributes)
    parsed = await parse_receipt(
        settings,
        data=data,
        mime_type=upload.mime_type,
        filename=upload.filename,
        accounts=attrs["accounts"],
        currencies=attrs["currencies"],
    )
    return {
        "upload": {"id": upload.id, "filename": upload.filename, "mimeType": upload.mime_type},
        "receipt": parsed,
    }


class InsertRequest(BaseModel):
    upload_id: str | None = Field(default=None, alias="uploadId")
    date: str
    payee: str = ""
    narration: str = ""
    amount: str
    currency: str
    expense_account: str = Field(alias="expenseAccount")
    payment_account: str = Field(alias="paymentAccount")
    flag: str = "*"
    tags: list[str] = []
    attach_file: bool = Field(default=True, alias="attachFile")
    filename: str | None = None

    model_config = ConfigDict(populate_by_name=True)


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:40] or "receipt"


@router.post("/insert", status_code=201)
async def insert(body: InsertRequest, access: LedgerWriteDep, user: UserDep, db: DbDep):
    store = get_store()
    ledger = access.ledger
    try:
        amount = Decimal(body.amount)
    except InvalidOperation as exc:
        raise ValidationError("Invalid amount") from exc
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", body.date):
        raise ValidationError("Date must be YYYY-MM-DD")
    meta: dict[str, str] = {}
    receipt_rel: str | None = None
    upload_bytes: bytes | None = None
    if body.upload_id and body.attach_file:
        upload, upload_bytes = await load_upload(db, user, body.upload_id)
        ext = Path(upload.filename).suffix.lower() or ".bin"
        receipt_rel = (
            f"receipts/{body.date}-{_slug(body.payee or body.narration)}-{upload.id[:6]}{ext}"
        )
        meta["receipt"] = receipt_rel
    meta_obj = await store.run(ledger, engine.ledger_meta)
    target_file = body.filename or await store.run(ledger, engine.default_file)
    text = render_transaction(
        txn_date=body.date,
        payee=body.payee.strip(),
        narration=body.narration.strip(),
        amount=abs(amount),
        currency=body.currency.upper(),
        source_account=body.expense_account,
        target_account=body.payment_account,
        flag=body.flag or "*",
        tags=body.tags,
        meta=meta,
        currency_column=meta_obj["favaOptions"]["currencyColumn"],
    )
    async with store.write_lock(ledger):
        if receipt_rel and upload_bytes is not None:
            store.write_bytes(ledger, receipt_rel, upload_bytes)
        current, _ = store.read_file(ledger, target_file)
        sep = "" if current.endswith("\n\n") else ("\n" if current.endswith("\n") else "\n\n")
        store.write_file(ledger, target_file, current + sep + text)
        sha = await store.commit(
            ledger,
            f"Add receipt: {body.payee or body.narration}"[:120],
            author_for(access.auth.user),
        )
        errors = await store.run(ledger, engine.errors)
    return {"commit": sha, "file": target_file, "receiptPath": receipt_rel, "errors": errors}
