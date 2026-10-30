"""Journal, entry context, and entry writes (source slices, new directives)."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Annotated, Any, Literal

from beancount.core import data as bc_data
from beancount.core.amount import Amount
from fastapi import APIRouter, Query
from fava.beans import create
from fava.util.date import parse_date
from pydantic import BaseModel, ConfigDict, Field

from app.core.deps import LedgerReadDep, LedgerWriteDep, author_for
from app.errors import ValidationError
from app.ledgers import engine
from app.ledgers.store import get_store
from app.logging_setup import get_logger
from app.routers.reports import QueryDep

log = get_logger(__name__)
router = APIRouter(prefix="/workspaces/{workspace}/ledgers/{slug}", tags=["entries"])


async def _run(access, fn, *args: Any, **kwargs: Any):
    return await get_store().run(access.ledger, lambda fava: fn(fava, *args, **kwargs))


# ------------------------------------------------------------------- journal


@router.get("/journal")
async def journal(
    access: LedgerReadDep,
    q: QueryDep,
    types: list[str] = Query(default=[]),
    flags: list[str] = Query(default=[]),
    search: str | None = Query(default=None, max_length=200),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    order: Literal["asc", "desc"] = Query(default="desc"),
):
    unknown = [t for t in types if t not in engine.ENTRY_TYPES]
    if unknown:
        raise ValidationError(f"Unknown entry types: {', '.join(unknown)}")
    return await _run(
        access,
        engine.journal,
        q,
        types=types,
        flags=flags,
        search=search,
        offset=offset,
        limit=limit,
        order=order,
    )


@router.get("/journal/plaintext")
async def plaintext(access: LedgerReadDep, q: QueryDep):
    text = await _run(access, engine.plaintext_journal, q)
    return {"content": text}


@router.get("/journal/account/{account_name:path}")
async def account_journal(
    account_name: str,
    access: LedgerReadDep,
    q: QueryDep,
    with_children: bool = Query(default=True, alias="withChildren"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
):
    return await _run(
        access,
        engine.account_journal,
        q,
        account_name,
        with_children=with_children,
        offset=offset,
        limit=limit,
    )


@router.get("/entries/{entry_hash}")
async def entry_context(entry_hash: str, access: LedgerReadDep):
    return await _run(access, engine.entry_context, entry_hash)


@router.get("/entries/{entry_hash}/slice")
async def entry_slice(entry_hash: str, access: LedgerReadDep):
    return await _run(access, engine.source_slice, entry_hash)


class SliceUpdate(BaseModel):
    source: str
    sha256sum: str
    message: str | None = None


@router.put("/entries/{entry_hash}")
async def update_entry(entry_hash: str, body: SliceUpdate, access: LedgerWriteDep):
    store = get_store()
    ledger = access.ledger
    async with store.write_lock(ledger):
        new_sha = await store.run(
            ledger,
            lambda fava: engine.save_slice(fava, entry_hash, body.source, body.sha256sum),
        )
        commit = await store.commit(
            ledger, body.message or f"Edit entry {entry_hash[:8]}", author_for(access.auth.user)
        )
    return {"sha256sum": new_sha, "commit": commit}


class SliceDelete(BaseModel):
    sha256sum: str
    message: str | None = None


@router.delete("/entries/{entry_hash}")
async def delete_entry(entry_hash: str, body: SliceDelete, access: LedgerWriteDep):
    store = get_store()
    ledger = access.ledger
    async with store.write_lock(ledger):
        await store.run(ledger, lambda fava: engine.delete_slice(fava, entry_hash, body.sha256sum))
        commit = await store.commit(
            ledger,
            body.message or f"Delete entry {entry_hash[:8]}",
            author_for(access.auth.user),
        )
    return {"deleted": True, "commit": commit}


# ------------------------------------------------------------- new entries


class PostingIn(BaseModel):
    account: str = Field(min_length=1)
    amount: str = Field(
        default="", description='e.g. "12.50 USD", "10 AAPL {150 USD}", or empty to auto-balance'
    )
    meta: dict[str, Any] = {}


class TransactionIn(BaseModel):
    type: Literal["Transaction"] = "Transaction"
    date: str
    flag: str = "*"
    payee: str = ""
    narration: str = ""
    tags: list[str] = []
    links: list[str] = []
    meta: dict[str, Any] = {}
    postings: list[PostingIn] = Field(min_length=1)


class BalanceIn(BaseModel):
    type: Literal["Balance"] = "Balance"
    date: str
    account: str
    amount: str = Field(description='e.g. "1234.56 USD"')
    meta: dict[str, Any] = {}


class NoteIn(BaseModel):
    type: Literal["Note"] = "Note"
    date: str
    account: str
    comment: str
    meta: dict[str, Any] = {}


class OpenIn(BaseModel):
    type: Literal["Open"] = "Open"
    date: str
    account: str
    currencies: list[str] = []
    booking: str | None = None
    meta: dict[str, Any] = {}


class CloseIn(BaseModel):
    type: Literal["Close"] = "Close"
    date: str
    account: str
    meta: dict[str, Any] = {}


class PadIn(BaseModel):
    type: Literal["Pad"] = "Pad"
    date: str
    account: str
    source_account: str = Field(alias="sourceAccount")
    meta: dict[str, Any] = {}
    model_config = ConfigDict(populate_by_name=True)


class PriceIn(BaseModel):
    type: Literal["Price"] = "Price"
    date: str
    currency: str
    amount: str
    meta: dict[str, Any] = {}


class EventIn(BaseModel):
    type: Literal["Event"] = "Event"
    date: str
    event_type: str = Field(alias="eventType")
    description: str
    meta: dict[str, Any] = {}
    model_config = ConfigDict(populate_by_name=True)


class DocumentIn(BaseModel):
    type: Literal["Document"] = "Document"
    date: str
    account: str
    filename: str
    tags: list[str] = []
    links: list[str] = []
    meta: dict[str, Any] = {}


class CommodityIn(BaseModel):
    type: Literal["Commodity"] = "Commodity"
    date: str
    currency: str
    meta: dict[str, Any] = {}


class BudgetIn(BaseModel):
    type: Literal["Budget"] = "Budget"
    date: str
    account: str
    period: Literal["daily", "weekly", "monthly", "quarterly", "yearly"]
    amount: str
    meta: dict[str, Any] = {}


EntryIn = Annotated[
    TransactionIn
    | BalanceIn
    | NoteIn
    | OpenIn
    | CloseIn
    | PadIn
    | PriceIn
    | EventIn
    | DocumentIn
    | CommodityIn
    | BudgetIn,
    Field(discriminator="type"),
]


class AddEntriesRequest(BaseModel):
    entries: list[EntryIn] = Field(min_length=1)
    message: str | None = None


def _date(value: str):
    begin, _end = parse_date(value)
    if begin is None:
        raise ValidationError(f"Invalid date '{value}'")
    return begin


def _amount(value: str) -> Amount:
    parts = value.strip().split()
    if len(parts) != 2:
        raise ValidationError(f"Invalid amount '{value}', expected e.g. '12.50 USD'")
    try:
        return create.amount(Decimal(parts[0]), parts[1])
    except InvalidOperation as exc:
        raise ValidationError(f"Invalid number in amount '{value}'") from exc


def _meta(meta: dict[str, Any]) -> dict[str, Any]:
    return {
        k: v for k, v in meta.items() if k not in ("filename", "lineno") and v not in (None, "")
    }


def build_entry(item: Any):
    """Turn a validated request model into a Beancount directive."""
    from fava.serialisation import deserialise_posting

    date = _date(item.date)
    meta = _meta(item.meta)
    if isinstance(item, TransactionIn):
        postings = [
            deserialise_posting({"account": p.account, "amount": p.amount, "meta": _meta(p.meta)})
            for p in item.postings
        ]
        return create.transaction(
            meta=meta,
            date=date,
            flag=item.flag or "*",
            payee=item.payee,
            narration=item.narration,
            tags=frozenset(t.lstrip("#") for t in item.tags if t.strip()),
            links=frozenset(link.lstrip("^") for link in item.links if link.strip()),
            postings=postings,
        )
    if isinstance(item, BalanceIn):
        return create.balance(
            meta=meta, date=date, account=item.account, amount=_amount(item.amount)
        )
    if isinstance(item, NoteIn):
        return create.note(
            meta=meta, date=date, account=item.account, comment=item.comment.replace('"', "'")
        )
    if isinstance(item, OpenIn):
        return bc_data.Open(
            meta,
            date,
            item.account,
            item.currencies or None,
            bc_data.Booking[item.booking] if item.booking else None,
        )
    if isinstance(item, CloseIn):
        return bc_data.Close(meta, date, item.account)
    if isinstance(item, PadIn):
        return bc_data.Pad(meta, date, item.account, item.source_account)
    if isinstance(item, PriceIn):
        return bc_data.Price(meta, date, item.currency, _amount(item.amount))
    if isinstance(item, EventIn):
        return bc_data.Event(meta, date, item.event_type, item.description)
    if isinstance(item, DocumentIn):
        return bc_data.Document(
            meta,
            date,
            item.account,
            item.filename,
            frozenset(item.tags) or None,
            frozenset(item.links) or None,
        )
    if isinstance(item, CommodityIn):
        return bc_data.Commodity(meta, date, item.currency)
    if isinstance(item, BudgetIn):
        amount = _amount(item.amount)
        return bc_data.Custom(
            meta,
            date,
            "budget",
            [
                bc_data.ValueType(
                    item.account,
                    bc_data.account_types.Account if hasattr(bc_data, "account_types") else str,
                ),
                bc_data.ValueType(item.period, str),
                bc_data.ValueType(amount, Amount),
            ],
        )
    raise ValidationError("Unsupported entry type")


@router.post("/entries", status_code=201)
async def add_entries(body: AddEntriesRequest, access: LedgerWriteDep):
    store = get_store()
    ledger = access.ledger
    directives = [build_entry(item) for item in body.entries]
    async with store.write_lock(ledger):
        hashes = await store.run(ledger, lambda fava: engine.insert_entries(fava, directives))
        label = body.message or (
            f"Add {len(directives)} entries"
            if len(directives) > 1
            else f"Add {directives[0].__class__.__name__.lower()}"
        )
        commit = await store.commit(ledger, label, author_for(access.auth.user))
        check = await store.run(ledger, engine.errors)
    return {"entryHashes": hashes, "commit": commit, "errors": check}


# ------------------------------------------------------------ autocomplete


@router.get("/payees/{payee}/accounts")
async def payee_accounts(payee: str, access: LedgerReadDep):
    return await _run(access, engine.payee_accounts, payee)


@router.get("/payees/{payee}/transaction")
async def payee_transaction(payee: str, access: LedgerReadDep):
    return await _run(access, engine.payee_transaction, payee)


@router.get("/narrations/{narration}/transaction")
async def narration_transaction(narration: str, access: LedgerReadDep):
    return await _run(access, engine.narration_transaction, narration)
