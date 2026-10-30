"""Statement import: parse -> suggest categories -> commit to the ledger (with de-duplication)."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel, ConfigDict, Field

from app.core.deps import LedgerReadDep, LedgerWriteDep, SettingsDep, author_for
from app.errors import ValidationError
from app.importers.csv_import import ColumnMapping, parse_statement, render_transaction
from app.ledgers import engine
from app.ledgers.store import get_store
from app.logging_setup import get_logger

log = get_logger(__name__)
router = APIRouter(prefix="/workspaces/{workspace}/ledgers/{slug}/imports", tags=["imports"])


@router.post("/parse")
async def parse(
    access: LedgerReadDep,
    settings: SettingsDep,
    file: UploadFile = File(...),
    mapping: str | None = Form(default=None),
):
    data = await file.read()
    if len(data) > settings.max_upload_bytes:
        raise ValidationError("File exceeds the upload limit")
    col_mapping = None
    if mapping:
        import json

        try:
            col_mapping = ColumnMapping(**json.loads(mapping))
        except (TypeError, ValueError) as exc:
            raise ValidationError(f"Invalid column mapping: {exc}") from exc
    result = parse_statement(file.filename or "statement.csv", data, col_mapping)
    ledger = access.ledger
    seen = await get_store().run(ledger, engine.transactions_for_dedup)
    attrs = await get_store().run(ledger, engine.attributes)
    result["existingKeys"] = [list(k) for k in seen]
    result["accounts"] = attrs["accounts"]
    result["currencies"] = attrs["currencies"]
    result["filename"] = file.filename
    return result


class CategorizeRow(BaseModel):
    id: int
    date: str | None = None
    payee: str = ""
    description: str = ""
    amount: str | None = None


class CategorizeRequest(BaseModel):
    rows: list[CategorizeRow] = Field(min_length=1, max_length=2000)
    source_account: str | None = Field(default=None, alias="sourceAccount")
    use_ai: bool = Field(default=True, alias="useAi")

    model_config = ConfigDict(populate_by_name=True)


@router.post("/categorize")
async def categorize(body: CategorizeRequest, access: LedgerReadDep, settings: SettingsDep):
    """Rule-based suggestions from payee history, refined by the AI model for unknown payees."""
    from app.ai.categorize import suggest_categories

    ledger = access.ledger
    history = await get_store().run(ledger, _payee_history)
    attrs = await get_store().run(ledger, engine.attributes)
    suggestions = await suggest_categories(
        settings,
        rows=[r.model_dump() for r in body.rows],
        history=history,
        accounts=attrs["accounts"],
        source_account=body.source_account,
        use_ai=body.use_ai and settings.ai_enabled,
    )
    return {"suggestions": suggestions}


def _payee_history(fava) -> dict[str, dict[str, int]]:
    """payee -> {account: count} over all transactions (excluding asset/liability funding legs)."""
    history: dict[str, dict[str, int]] = {}
    options = fava.options
    for txn in fava.all_entries_by_type.Transaction:
        payee = (txn.payee or txn.narration or "").strip().lower()
        if not payee:
            continue
        bucket = history.setdefault(payee, {})
        for p in txn.postings:
            if p.account.startswith((options["name_income"], options["name_expenses"])):
                bucket[p.account] = bucket.get(p.account, 0) + 1
    return history


class CommitRow(BaseModel):
    id: int
    date: str
    payee: str = ""
    narration: str = ""
    amount: str
    currency: str
    target_account: str = Field(alias="targetAccount")
    flag: str = "*"
    tags: list[str] = []

    model_config = ConfigDict(populate_by_name=True)


class CommitRequest(BaseModel):
    rows: list[CommitRow] = Field(min_length=1, max_length=5000)
    source_account: str = Field(alias="sourceAccount")
    filename: str | None = None
    message: str | None = None
    skip_duplicates: bool = Field(default=True, alias="skipDuplicates")

    model_config = ConfigDict(populate_by_name=True)


@router.post("/commit", status_code=201)
async def commit(body: CommitRequest, access: LedgerWriteDep):
    store = get_store()
    ledger = access.ledger
    seen = await store.run(ledger, engine.transactions_for_dedup)
    meta = await store.run(ledger, engine.ledger_meta)
    currency_column = meta["favaOptions"]["currencyColumn"]
    target_file = body.filename or await store.run(ledger, engine.default_file)

    rendered: list[str] = []
    skipped: list[int] = []
    written_ids: list[int] = []
    for row in sorted(body.rows, key=lambda r: r.date):
        try:
            amount = Decimal(row.amount)
        except InvalidOperation as exc:
            raise ValidationError(f"Row {row.id}: invalid amount {row.amount!r}") from exc
        key = (row.date, body.source_account, str(amount), row.currency)
        if body.skip_duplicates and key in seen:
            skipped.append(row.id)
            continue
        rendered.append(
            render_transaction(
                txn_date=row.date,
                payee=row.payee.strip(),
                narration=row.narration.strip(),
                amount=amount,
                currency=row.currency,
                source_account=body.source_account,
                target_account=row.target_account,
                flag=row.flag or "*",
                tags=row.tags,
                currency_column=currency_column,
            )
        )
        written_ids.append(row.id)
        seen.add(key)
    if not rendered:
        return {"written": 0, "skipped": skipped, "commit": None, "errors": []}
    async with store.write_lock(ledger):
        current, _sha = store.read_file(ledger, target_file)
        separator = "" if current.endswith("\n\n") else ("\n" if current.endswith("\n") else "\n\n")
        store.write_file(ledger, target_file, current + separator + "\n".join(rendered))
        sha = await store.commit(
            ledger,
            body.message or f"Import {len(rendered)} transactions into {body.source_account}",
            author_for(access.auth.user),
        )
        errors = await store.run(ledger, engine.errors)
    log.info(
        "imported %d transactions into ledger %s (%d duplicates skipped)",
        len(rendered),
        ledger.id,
        len(skipped),
    )
    return {
        "written": len(rendered),
        "writtenIds": written_ids,
        "skipped": skipped,
        "commit": sha,
        "file": target_file,
        "errors": errors,
    }


def _dict(obj: Any) -> dict[str, Any]:
    return dict(obj)
