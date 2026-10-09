"""Report and journal functions on top of Fava's core. Every function here is synchronous,
takes a loaded `FavaLedger`, and returns JSON-serialisable data (see `to_jsonable`).
"""

from __future__ import annotations

import datetime as dt
import re
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, fields, is_dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any

from beancount.core.amount import Amount
from beancount.core.number import MISSING
from beancount.core.position import Cost, CostSpec
from fava.beans.abc import Balance, Custom, Document, Event, Transaction
from fava.beans.funcs import hash_entry
from fava.core import FavaLedger, FilteredLedger
from fava.core.conversion import UNITS, Conversion, conversion_from_str
from fava.core.file import get_entry_slice
from fava.core.filters import FilterError
from fava.core.group_entries import group_entries_by_type
from fava.core.inventory import CounterInventory
from fava.core.query import QueryResultTable, QueryResultText
from fava.core.tree import SerialisedTreeNode
from fava.helpers import FavaAPIError
from fava.serialisation import serialise as fava_serialise
from fava.util.date import INTERVALS, DateRange, Interval

from app.errors import LedgerError, NotFoundError, ValidationError

# --------------------------------------------------------------------------- json


def to_jsonable(obj: Any) -> Any:
    """Convert Fava/Beancount values into plain JSON types. Decimals become floats."""
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    if obj is MISSING:
        return None
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, (dt.datetime, dt.date)):
        return obj.isoformat()
    if isinstance(obj, Amount):
        return {"number": to_jsonable(obj.number), "currency": obj.currency}
    if isinstance(obj, Cost):
        return {
            "number": to_jsonable(obj.number),
            "currency": obj.currency,
            "date": to_jsonable(obj.date),
            "label": obj.label,
        }
    if isinstance(obj, CostSpec):
        return str(obj)
    if isinstance(obj, (set, frozenset)):
        return sorted(to_jsonable(v) for v in obj)
    if isinstance(obj, re.Pattern):
        return obj.pattern
    if is_dataclass(obj) and not isinstance(obj, type):
        return {f.name: to_jsonable(getattr(obj, f.name)) for f in fields(obj)}
    if isinstance(obj, Mapping):
        return {str(k): to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, tuple) and hasattr(obj, "_asdict"):
        return to_jsonable(obj._asdict())
    if isinstance(obj, (list, tuple)):
        return [to_jsonable(v) for v in obj]
    if hasattr(obj, "__str__"):
        return str(obj)
    raise TypeError(f"Cannot serialise {type(obj)!r}")


# ------------------------------------------------------------------------ queries


@dataclass(frozen=True)
class ReportQuery:
    account: str | None = None
    filter: str | None = None
    time: str | None = None
    conversion: str = "at_cost"
    interval: str = "month"

    @property
    def conv(self) -> Conversion:
        return conversion_from_str(self.conversion or "at_cost")

    @property
    def interval_obj(self) -> Interval:
        key = (self.interval or "month").lower()
        if key not in INTERVALS:
            raise ValidationError(f"Unknown interval '{self.interval}'")
        return INTERVALS[key]


def get_filtered(ledger: FavaLedger, q: ReportQuery) -> FilteredLedger:
    try:
        return ledger.get_filtered(
            account=q.account or None, filter=q.filter or None, time=q.time or None
        )
    except FilterError as exc:
        raise ValidationError(str(exc)) from exc


def _date_range(dr: DateRange | None) -> dict[str, str] | None:
    if dr is None:
        return None
    return {
        "begin": dr.begin.isoformat(),
        "end": dr.end.isoformat(),
        "endInclusive": dr.end_inclusive.isoformat(),
    }


def _relative_filename(ledger: FavaLedger, filename: str | None) -> str | None:
    if not filename:
        return None
    root = Path(ledger.beancount_file_path).parent.resolve()
    try:
        return Path(filename).resolve().relative_to(root).as_posix()
    except ValueError:
        return filename


def _tree(node: SerialisedTreeNode) -> dict[str, Any]:
    return {
        "account": node.account,
        "balance": to_jsonable(node.balance),
        "balanceChildren": to_jsonable(node.balance_children),
        "children": [_tree(c) for c in node.children],
        "hasTxns": node.has_txns,
        "cost": to_jsonable(node.cost) if node.cost is not None else None,
        "costChildren": to_jsonable(node.cost_children) if node.cost_children is not None else None,
    }


def _hierarchy(
    ledger: FavaLedger,
    filtered: FilteredLedger,
    account: str,
    conv: Conversion,
    *,
    closed: bool = False,
) -> dict[str, Any]:
    tree = filtered.root_tree_closed if closed else filtered.root_tree
    node = tree.get(account)
    return _tree(
        node.serialise(
            conv,
            ledger.prices,
            filtered.end_date,
            with_cost=conv == conversion_from_str("at_value"),
        )
    )


def _interval_totals(
    ledger: FavaLedger,
    filtered: FilteredLedger,
    interval: Interval,
    accounts: str | tuple[str, ...],
    conv: Conversion,
    *,
    invert: bool = False,
) -> list[dict[str, Any]]:
    return [
        {
            "date": item.date.isoformat(),
            "balance": to_jsonable(item.balance),
            "accountBalances": to_jsonable(item.account_balances),
            "budgets": to_jsonable(item.budgets),
        }
        for item in ledger.charts.interval_totals(filtered, interval, accounts, conv, invert=invert)
    ]


def _balances(items: Iterable[Any]) -> list[dict[str, Any]]:
    return [{"date": item.date.isoformat(), "balance": to_jsonable(item.balance)} for item in items]


# ----------------------------------------------------------------------- entries


def serialise_entry(ledger: FavaLedger, entry: Any) -> dict[str, Any]:
    """Fava's serialisation plus structured posting fields and repo-relative filenames."""
    raw = fava_serialise(entry)
    meta = dict(raw.get("meta") or {})
    meta.pop("__tolerances__", None)
    out: dict[str, Any] = {
        k: to_jsonable(v) for k, v in raw.items() if k not in ("meta", "postings")
    }
    if isinstance(entry, (Event, Custom)):
        # Both directives carry their own `type` field, which the class name below replaces.
        out["type_"] = entry.type
    out["type"] = raw["t"]
    out["entryHash"] = raw["entry_hash"]
    out["filename"] = _relative_filename(ledger, meta.get("filename"))
    out["lineno"] = meta.get("lineno")
    out["meta"] = to_jsonable({k: v for k, v in meta.items() if k not in ("filename", "lineno")})
    if isinstance(entry, Transaction):
        postings = []
        for posting, serialised in zip(entry.postings, raw["postings"], strict=True):
            pmeta = dict(serialised.get("meta") or {})
            units = posting.units
            postings.append(
                {
                    "account": posting.account,
                    "amount": serialised["amount"],
                    "units": to_jsonable(units)
                    if units is not None and units is not MISSING
                    else None,
                    "cost": to_jsonable(posting.cost) if posting.cost is not None else None,
                    "price": to_jsonable(posting.price) if posting.price is not None else None,
                    "flag": posting.flag,
                    "lineno": pmeta.get("lineno"),
                    "meta": to_jsonable(
                        {k: v for k, v in pmeta.items() if k not in ("filename", "lineno")}
                    ),
                }
            )
        out["postings"] = postings
    return out


ENTRY_TYPES = (
    "Transaction",
    "Balance",
    "Open",
    "Close",
    "Note",
    "Document",
    "Pad",
    "Price",
    "Event",
    "Query",
    "Custom",
    "Commodity",
)


def _matches_search(entry_json: dict[str, Any], needle: str) -> bool:
    hay = [
        entry_json.get("payee") or "",
        entry_json.get("narration") or "",
        entry_json.get("account") or "",
        entry_json.get("comment") or "",
        entry_json.get("description") or "",
        " ".join(entry_json.get("tags") or []),
        " ".join(entry_json.get("links") or []),
        " ".join(p.get("account", "") for p in entry_json.get("postings") or []),
    ]
    return needle in " ".join(hay).lower()


def journal(
    ledger: FavaLedger,
    q: ReportQuery,
    *,
    types: Sequence[str] | None = None,
    flags: Sequence[str] | None = None,
    search: str | None = None,
    offset: int = 0,
    limit: int = 50,
    order: str = "desc",
) -> dict[str, Any]:
    filtered = get_filtered(ledger, q)
    entries = (
        list(filtered.entries_without_prices)
        if not (types and "Price" in types)
        else list(filtered.entries)
    )
    wanted = set(types or ())
    flag_set = set(flags or ())
    needle = (search or "").strip().lower()

    selected = []
    for entry in entries:
        kind = entry.__class__.__name__
        if wanted and kind not in wanted:
            continue
        if flag_set and isinstance(entry, Transaction) and entry.flag not in flag_set:
            continue
        selected.append(entry)
    if order == "desc":
        selected.reverse()
    if needle:
        page_items: list[dict[str, Any]] = []
        total = 0
        for entry in selected:
            payload = serialise_entry(ledger, entry)
            if not _matches_search(payload, needle):
                continue
            if offset <= total < offset + limit:
                page_items.append(payload)
            total += 1
        return {"entries": page_items, "total": total, "offset": offset, "limit": limit}
    total = len(selected)
    page = selected[offset : offset + limit]
    return {
        "entries": [serialise_entry(ledger, e) for e in page],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


def plaintext_journal(ledger: FavaLedger, q: ReportQuery) -> str:
    filtered = get_filtered(ledger, q)
    return "\n".join(str(block) for block in ledger.file.render_entries(filtered.entries))


def entry_context(ledger: FavaLedger, entry_hash: str) -> dict[str, Any]:
    try:
        entry, before, after = ledger.context(entry_hash)
    except FavaAPIError as exc:
        raise NotFoundError(str(exc)) from exc
    try:
        source_slice, sha256sum = get_entry_slice(entry)
    except (KeyError, FileNotFoundError, ValueError):
        source_slice, sha256sum = "", ""
    return {
        "entry": serialise_entry(ledger, entry),
        "balancesBefore": to_jsonable(before),
        "balancesAfter": to_jsonable(after),
        "slice": source_slice,
        "sha256sum": sha256sum,
    }


def account_journal(
    ledger: FavaLedger,
    q: ReportQuery,
    account: str,
    *,
    with_children: bool = True,
    offset: int = 0,
    limit: int = 50,
) -> dict[str, Any]:
    filtered = get_filtered(ledger, q)
    rows = ledger.account_journal(filtered, account, q.conv, with_children=with_children)
    rows = list(reversed(rows))
    total = len(rows)
    page = rows[offset : offset + limit]
    return {
        "account": account,
        "withChildren": with_children,
        "items": [
            {
                "entry": serialise_entry(ledger, entry),
                "change": to_jsonable(change),
                "balance": to_jsonable(balance),
            }
            for _index, entry, change, balance in page
        ],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


# ------------------------------------------------------------------------ ledger


def ledger_meta(ledger: FavaLedger) -> dict[str, Any]:
    options = ledger.options
    fo = ledger.fava_options
    by_type = ledger.all_entries_by_type
    txns = by_type.Transaction
    last_date = max((e.date for e in ledger.all_entries), default=None)
    return {
        "title": options["title"],
        "operatingCurrencies": list(options["operating_currency"]),
        "options": {
            "title": options["title"],
            "operatingCurrency": list(options["operating_currency"]),
            "nameAssets": options["name_assets"],
            "nameLiabilities": options["name_liabilities"],
            "nameEquity": options["name_equity"],
            "nameIncome": options["name_income"],
            "nameExpenses": options["name_expenses"],
            "documents": list(options["documents"]),
            "include": [_relative_filename(ledger, f) for f in options["include"]],
            "renderCommas": bool(options.get("render_commas")),
        },
        "favaOptions": {
            "invertIncomeLiabilitiesEquity": fo.invert_income_liabilities_equity,
            "conversionCurrencies": list(fo.conversion_currencies),
            "fiscalYearEnd": {"month": fo.fiscal_year_end.month, "day": fo.fiscal_year_end.day},
            "defaultFile": _relative_filename(ledger, fo.default_file),
            "currencyColumn": fo.currency_column,
            "indent": fo.indent,
            "showClosedAccounts": fo.show_closed_accounts,
            "showAccountsWithZeroBalance": fo.show_accounts_with_zero_balance,
            "collapsePattern": [p.pattern for p in fo.collapse_pattern],
        },
        "precisions": ledger.format_decimal.precisions,
        "commodityNames": ledger.commodities.names,
        "sourceFiles": [_relative_filename(ledger, f) for f in options["include"]],
        "errorsCount": len(ledger.errors),
        "entriesCount": len(ledger.all_entries),
        "transactionsCount": len(txns),
        "accountsCount": len(ledger.attributes.accounts),
        "lastEntryDate": last_date.isoformat() if last_date else None,
        "lastTransactionDate": txns[-1].date.isoformat() if txns else None,
        "directiveCounts": {k: len(v) for k, v in by_type._asdict().items()},
    }


def attributes(ledger: FavaLedger) -> dict[str, Any]:
    attr = ledger.attributes
    return {
        "accounts": list(attr.accounts),
        "currencies": list(attr.currencies),
        "payees": list(attr.payees),
        "tags": list(attr.tags),
        "links": list(attr.links),
        "years": list(attr.years),
        "narrations": list(attr.narrations),
    }


def errors(ledger: FavaLedger) -> list[dict[str, Any]]:
    out = []
    for err in ledger.errors:
        source = dict(err.source) if err.source is not None else {}
        out.append(
            {
                "type": err.__class__.__name__,
                "message": str(err.message),
                "filename": _relative_filename(ledger, source.get("filename")),
                "lineno": source.get("lineno"),
            }
        )
    return out


def options_report(ledger: FavaLedger) -> dict[str, Any]:
    from pprint import pformat

    fo = ledger.fava_options
    return {
        "beancount": {k: str(v) for k, v in sorted(ledger.options.items())},
        "fava": {f.name.replace("_", "-"): pformat(getattr(fo, f.name)) for f in fields(fo)},
    }


def accounts_detail(ledger: FavaLedger, q: ReportQuery) -> list[dict[str, Any]]:
    filtered = get_filtered(ledger, q)
    tree = filtered.root_tree
    counts: dict[str, int] = defaultdict(int)
    for entry in filtered.entries:
        for posting in getattr(entry, "postings", []):
            counts[posting.account] += 1
        account = getattr(entry, "account", None)
        if isinstance(account, str) and not isinstance(entry, Transaction):
            counts[account] += 1
    open_hashes = {o.account: hash_entry(o) for o in ledger.all_entries_by_type.Open}
    close_hashes = {c.account: hash_entry(c) for c in ledger.all_entries_by_type.Close}
    out = []
    for open_entry in ledger.all_entries_by_type.Open:
        name = open_entry.account
        info = ledger.accounts[name]
        node = tree.get(name)
        meta = {k: v for k, v in (info.meta or {}).items() if k not in ("filename", "lineno")}
        out.append(
            {
                "account": name,
                "openedAt": open_entry.date.isoformat(),
                "closedAt": info.close_date.isoformat() if info.close_date else None,
                "currencies": list(info.currencies or []),
                "meta": to_jsonable(meta),
                "balance": to_jsonable(UNITS.apply(node.balance)),
                "balanceChildren": to_jsonable(UNITS.apply(node.balance_children)),
                "entryCount": counts.get(name, 0),
                "entryHash": open_hashes.get(name),
                "closeEntryHash": close_hashes.get(name),
                "lastEntry": {
                    "date": info.last_entry.date.isoformat(),
                    "entryHash": info.last_entry.entry_hash,
                }
                if info.last_entry
                else None,
                "uptodateStatus": info.uptodate_status,
                "balanceString": info.balance_string,
            }
        )
    out.sort(key=lambda a: a["account"])
    return out


# ------------------------------------------------------------------------ reports


def overview(ledger: FavaLedger, q: ReportQuery) -> dict[str, Any]:
    filtered = get_filtered(ledger, q)
    options = ledger.options
    conv = q.conv
    interval = q.interval_obj
    invert = ledger.fava_options.invert_income_liabilities_equity
    at_value = conversion_from_str(
        q.conversion if q.conversion not in ("at_cost", "units") else "at_value"
    )
    transactions = [e for e in reversed(filtered.entries) if isinstance(e, Transaction)]
    return {
        "dateRange": _date_range(filtered.date_range),
        "netWorth": _balances(ledger.charts.net_worth(filtered, interval, conv)),
        "netWorthAtValue": _balances(ledger.charts.net_worth(filtered, interval, at_value)),
        "assets": _hierarchy(ledger, filtered, options["name_assets"], conv, closed=True),
        "liabilities": _hierarchy(ledger, filtered, options["name_liabilities"], conv, closed=True),
        "income": _hierarchy(ledger, filtered, options["name_income"], conv),
        "expenses": _hierarchy(ledger, filtered, options["name_expenses"], conv),
        "incomeIntervals": _interval_totals(
            ledger, filtered, interval, options["name_income"], conv, invert=True
        ),
        "expensesIntervals": _interval_totals(
            ledger, filtered, interval, options["name_expenses"], conv
        ),
        "netProfitIntervals": _interval_totals(
            ledger,
            filtered,
            interval,
            (options["name_income"], options["name_expenses"]),
            conv,
            invert=not invert,
        ),
        "recentTransactions": [serialise_entry(ledger, e) for e in transactions[:8]],
        "transactionsCount": len(transactions),
        "errorsCount": len(ledger.errors),
        "upcomingEvents": [serialise_entry(ledger, e) for e in ledger.misc.upcoming_events],
    }


def income_statement(ledger: FavaLedger, q: ReportQuery) -> dict[str, Any]:
    filtered = get_filtered(ledger, q)
    options = ledger.options
    conv = q.conv
    interval = q.interval_obj
    invert = ledger.fava_options.invert_income_liabilities_equity
    root = filtered.root_tree
    net_profit = root.net_profit(options, "Net Profit")
    return {
        "dateRange": _date_range(filtered.date_range),
        "charts": {
            "netProfit": _interval_totals(
                ledger,
                filtered,
                interval,
                (options["name_income"], options["name_expenses"]),
                conv,
                invert=invert,
            ),
            "income": _interval_totals(
                ledger, filtered, interval, options["name_income"], conv, invert=invert
            ),
            "expenses": _interval_totals(
                ledger, filtered, interval, options["name_expenses"], conv
            ),
        },
        "trees": {
            "income": _hierarchy(ledger, filtered, options["name_income"], conv),
            "netProfit": _tree(net_profit.serialise(conv, ledger.prices, filtered.end_date)),
            "expenses": _hierarchy(ledger, filtered, options["name_expenses"], conv),
        },
        "invertIncomeLiabilitiesEquity": invert,
    }


def balance_sheet(ledger: FavaLedger, q: ReportQuery) -> dict[str, Any]:
    filtered = get_filtered(ledger, q)
    options = ledger.options
    conv = q.conv
    interval = q.interval_obj
    return {
        "dateRange": _date_range(filtered.date_range),
        "charts": {
            "netWorth": _balances(ledger.charts.net_worth(filtered, interval, conv)),
            "assets": _balances(ledger.charts.linechart(filtered, options["name_assets"], conv)),
            "liabilities": _balances(
                ledger.charts.linechart(filtered, options["name_liabilities"], conv)
            ),
        },
        "trees": {
            "assets": _hierarchy(ledger, filtered, options["name_assets"], conv, closed=True),
            "liabilities": _hierarchy(
                ledger, filtered, options["name_liabilities"], conv, closed=True
            ),
            "equity": _hierarchy(ledger, filtered, options["name_equity"], conv, closed=True),
        },
        "invertIncomeLiabilitiesEquity": ledger.fava_options.invert_income_liabilities_equity,
    }


def trial_balance(ledger: FavaLedger, q: ReportQuery) -> dict[str, Any]:
    filtered = get_filtered(ledger, q)
    return {
        "dateRange": _date_range(filtered.date_range),
        "tree": _hierarchy(ledger, filtered, "", q.conv),
    }


_CASH_RE = re.compile(
    r"(cash|checking|chequing|current|savings?|bank|wallet|paypal|venmo|revolut|wise|petty)", re.I
)
_INVESTING_RE = re.compile(
    r"(invest|broker|retire|401k|403b|ira\b|roth|pension|stock|equit|fund|etf|crypto|bitcoin|property|real[- ]?estate|vehicle|car\b|house|home\b|receivable|loan[s]?[-:]?(to|given))",
    re.I,
)
_FINANCING_RE = re.compile(r"(loan|mortgage|debt|bond|line[- ]of[- ]credit|margin|lease)", re.I)


def classify_cash_flow_role(
    account: str, meta: Mapping[str, Any], options: Mapping[str, Any]
) -> tuple[str, bool]:
    """Return (role, declared). Roles: cash | operating | investing | financing | excluded."""
    declared = meta.get("cash-flow-role")
    if isinstance(declared, str) and declared in (
        "cash",
        "operating",
        "investing",
        "financing",
        "excluded",
    ):
        return declared, True
    assets, liabilities, equity, income, expenses = (
        options["name_assets"],
        options["name_liabilities"],
        options["name_equity"],
        options["name_income"],
        options["name_expenses"],
    )
    if account.startswith((income, expenses)):
        return "operating", False
    if account.startswith(equity):
        return "excluded", False
    if account.startswith(assets):
        if _INVESTING_RE.search(account):
            return "investing", False
        if _CASH_RE.search(account):
            return "cash", False
        # Default for assets: liquid-looking leaves are cash, anything else investing.
        return "investing", False
    if account.startswith(liabilities):
        if _FINANCING_RE.search(account):
            return "financing", False
        return "operating", False  # credit cards, payables
    return "excluded", False


def cash_flow(ledger: FavaLedger, q: ReportQuery) -> dict[str, Any]:
    """Direct-method cash flow statement by interval, computed from cash-account movements."""
    filtered = get_filtered(ledger, q)
    options = ledger.options
    conv = q.conv
    interval = q.interval_obj
    roles: dict[str, tuple[str, bool]] = {}

    def role_of(account: str) -> tuple[str, bool]:
        if account not in roles:
            roles[account] = classify_cash_flow_role(
                account, ledger.accounts[account].meta, options
            )
        return roles[account]

    ranges = list(filtered.interval_ranges(interval))
    txns = [e for e in filtered.entries if isinstance(e, Transaction)]
    all_txns = [e for e in ledger.all_entries if isinstance(e, Transaction)]
    prices = ledger.prices

    def cash_balance_until(end: dt.date) -> CounterInventory:
        inv = CounterInventory()
        for txn in all_txns:
            if txn.date >= end:
                break
            for p in txn.postings:
                if role_of(p.account)[0] == "cash":
                    inv.add_position(p)
        return inv

    intervals = []
    account_totals: dict[str, CounterInventory] = defaultdict(CounterInventory)
    cursor = 0
    for date_range in ranges:
        buckets: dict[str, CounterInventory] = {
            k: CounterInventory() for k in ("operating", "investing", "financing")
        }
        while cursor < len(txns) and txns[cursor].date < date_range.begin:
            cursor += 1
        i = cursor
        while i < len(txns) and txns[i].date < date_range.end:
            txn = txns[i]
            i += 1
            has_cash = any(role_of(p.account)[0] == "cash" for p in txn.postings)
            if not has_cash:
                continue
            for p in txn.postings:
                role, _ = role_of(p.account)
                if role in ("cash", "excluded"):
                    continue
                negated = CounterInventory()
                negated.add_position(p)
                negated = -negated
                buckets[role].add_inventory(negated)
                account_totals[p.account].add_inventory(negated)
        opening = conv.apply(cash_balance_until(date_range.begin), prices, date_range.begin)
        closing = conv.apply(cash_balance_until(date_range.end), prices, date_range.end_inclusive)
        converted = {k: conv.apply(v, prices, date_range.end_inclusive) for k, v in buckets.items()}
        net = CounterInventory()
        for v in buckets.values():
            net.add_inventory(v)
        intervals.append(
            {
                "date": date_range.end_inclusive.isoformat(),
                "begin": date_range.begin.isoformat(),
                "operating": to_jsonable(converted["operating"]),
                "investing": to_jsonable(converted["investing"]),
                "financing": to_jsonable(converted["financing"]),
                "netChange": to_jsonable(conv.apply(net, prices, date_range.end_inclusive)),
                "openingCash": to_jsonable(opening),
                "closingCash": to_jsonable(closing),
            }
        )
    end_date = filtered.end_date
    accounts = [
        {
            "account": account,
            "role": role_of(account)[0],
            "declared": role_of(account)[1],
            "total": to_jsonable(conv.apply(inv, prices, end_date)),
        }
        for account, inv in sorted(account_totals.items())
    ]
    cash_accounts = sorted(a for a in ledger.attributes.accounts if role_of(a)[0] == "cash")
    return {
        "dateRange": _date_range(filtered.date_range),
        "intervals": intervals,
        "accounts": accounts,
        "cashAccounts": [{"account": a, "declared": role_of(a)[1]} for a in cash_accounts],
    }


def account_report(ledger: FavaLedger, q: ReportQuery, account: str) -> dict[str, Any]:
    filtered = get_filtered(ledger, q)
    if account not in ledger.get_filtered().root_tree:
        raise NotFoundError(f"Account {account} not found")
    conv = q.conv
    interval = q.interval_obj
    interval_balances, dates = ledger.interval_balances(
        filtered, interval, account, accumulate=False
    )
    budgets_mod = ledger.budgets
    budgets: dict[str, list[dict[str, Any]]] = {}
    if dates:
        all_accounts = interval_balances[0].accounts if interval_balances else []
        for acc in (a for a in all_accounts if a.startswith(account)):
            rows = []
            for date_range in dates:
                rows.append(
                    {
                        "budget": to_jsonable(
                            budgets_mod.calculate(acc, date_range.begin, date_range.end)
                        ),
                        "budgetChildren": to_jsonable(
                            budgets_mod.calculate_children(acc, date_range.begin, date_range.end)
                        ),
                    }
                )
            if any(r["budget"] or r["budgetChildren"] for r in rows):
                budgets[acc] = rows
    info = ledger.accounts[account]
    return {
        "account": account,
        "dateRange": _date_range(filtered.date_range),
        "closedAt": info.close_date.isoformat() if info.close_date else None,
        "meta": to_jsonable(
            {k: v for k, v in (info.meta or {}).items() if k not in ("filename", "lineno")}
        ),
        "charts": {
            "balance": _balances(ledger.charts.linechart(filtered, account, conv)),
            "changes": _interval_totals(ledger, filtered, interval, account, conv),
        },
        "intervalBalances": [
            {
                "date": date_range.end_inclusive.isoformat(),
                "begin": date_range.begin.isoformat(),
                "tree": _tree(
                    tree.get(account).serialise(
                        conv, ledger.prices, date_range.end_inclusive, with_cost=False
                    )
                ),
            }
            for tree, date_range in zip(interval_balances, dates, strict=True)
        ][:24],
        "budgets": budgets,
    }


def interval_totals(
    ledger: FavaLedger, q: ReportQuery, accounts: Sequence[str], *, invert: bool = False
) -> list[dict[str, Any]]:
    filtered = get_filtered(ledger, q)
    target: str | tuple[str, ...] = accounts[0] if len(accounts) == 1 else tuple(accounts)
    return _interval_totals(ledger, filtered, q.interval_obj, target, q.conv, invert=invert)


# ---------------------------------------------------------------------- data pages


def commodities(ledger: FavaLedger, q: ReportQuery) -> dict[str, Any]:
    filtered = get_filtered(ledger, q)
    pairs = []
    for base, quote in ledger.commodity_pairs():
        prices = filtered.prices(base, quote)
        if prices:
            pairs.append(
                {
                    "base": base,
                    "quote": quote,
                    "prices": [{"date": d.isoformat(), "value": float(v)} for d, v in prices],
                }
            )
    declared = [
        {
            "currency": c.currency,
            "date": c.date.isoformat(),
            "meta": to_jsonable(
                {k: v for k, v in c.meta.items() if k not in ("filename", "lineno")}
            ),
            "entryHash": hash_entry(c),
        }
        for c in ledger.all_entries_by_type.Commodity
    ]
    return {
        "pairs": pairs,
        "names": ledger.commodities.names,
        "declared": declared,
        "precisions": ledger.format_decimal.precisions,
    }


def documents(ledger: FavaLedger, q: ReportQuery) -> list[dict[str, Any]]:
    filtered = get_filtered(ledger, q)
    out = []
    for entry in filtered.entries:
        if isinstance(entry, Document):
            payload = serialise_entry(ledger, entry)
            payload["documentPath"] = _relative_filename(ledger, entry.filename)
            payload["basename"] = Path(entry.filename).name
            out.append(payload)
    out.reverse()
    return out


def events(ledger: FavaLedger, q: ReportQuery) -> list[dict[str, Any]]:
    filtered = get_filtered(ledger, q)
    return [serialise_entry(ledger, e) for e in reversed(filtered.entries) if isinstance(e, Event)]


def statistics(ledger: FavaLedger, q: ReportQuery) -> dict[str, Any]:
    filtered = get_filtered(ledger, q)
    by_type = {k: len(v) for k, v in group_entries_by_type(filtered.entries)._asdict().items()}
    postings: dict[str, int] = defaultdict(int)
    for entry in filtered.entries:
        for posting in getattr(entry, "postings", []):
            postings[posting.account] += 1
    options = ledger.options
    last_entries = []
    for account in ledger.attributes.accounts:
        if not account.startswith((options["name_assets"], options["name_liabilities"])):
            continue
        info = ledger.accounts[account]
        node = filtered.root_tree.get(account)
        last_entries.append(
            {
                "account": account,
                "date": info.last_entry.date.isoformat() if info.last_entry else None,
                "entryHash": info.last_entry.entry_hash if info.last_entry else None,
                "balance": to_jsonable(UNITS.apply(node.balance)),
                "uptodateStatus": info.uptodate_status,
            }
        )
    return {
        "entriesByType": [{"type": k, "count": v} for k, v in sorted(by_type.items())],
        "postingsPerAccount": [
            {"account": a, "count": c}
            for a, c in sorted(postings.items(), key=lambda kv: (-kv[1], kv[0]))
        ],
        "accountLastEntries": last_entries,
        "allBalanceDirectives": ledger.accounts.all_balance_directives(),
    }


def budgets(ledger: FavaLedger, q: ReportQuery) -> dict[str, Any]:
    filtered = get_filtered(ledger, q)
    today = dt.date.today()
    entries = []
    for custom in ledger.all_entries_by_type.Custom:
        if custom.type != "budget":
            continue
        payload = serialise_entry(ledger, custom)
        values = custom.values
        try:
            account = values[0].value
            period = values[1].value
            amount = values[2].value
            payload.update(
                {
                    "account": account,
                    "period": period,
                    "number": float(amount.number),
                    "currency": amount.currency,
                }
            )
        except (IndexError, AttributeError):
            payload.update({"account": None, "period": None, "number": None, "currency": None})
        entries.append(payload)
    entries.sort(key=lambda e: (e.get("account") or "", e["date"]), reverse=False)

    # Budget vs actual for the current month, quarter and year.
    conv = q.conv
    report = []
    accounts = sorted({e["account"] for e in entries if e.get("account")})
    for interval_name in ("month", "quarter", "year"):
        interval = INTERVALS[interval_name]
        begin = interval.get_prev(today)
        end = interval.get_next(begin)
        rows = []
        for account in accounts:
            budget = ledger.budgets.calculate_children(account, begin, end)
            if not budget:
                continue
            inv = CounterInventory()
            for txn in ledger.all_entries_by_type.Transaction:
                if begin <= txn.date < end:
                    for p in txn.postings:
                        if p.account == account or p.account.startswith(account + ":"):
                            inv.add_position(p)
            actual = conv.apply(inv, ledger.prices, end - dt.timedelta(days=1))
            rows.append(
                {
                    "account": account,
                    "budget": to_jsonable(budget),
                    "actual": to_jsonable(actual),
                }
            )
        report.append(
            {
                "interval": interval_name,
                "begin": begin.isoformat(),
                "end": end.isoformat(),
                "rows": rows,
            }
        )
    return {"entries": entries, "report": report, "dateRange": _date_range(filtered.date_range)}


HOLDINGS_QUERY = """
SELECT
  account,
  units(sum(position)) as units,
  cost_number as cost,
  first(getprice(currency, cost_currency, today())) as price,
  cost(sum(position)) as book_value,
  value(sum(position), today()) as market_value,
  safediv((abs(sum(number(value(position, today())))) - abs(sum(number(cost(position))))), sum(number(cost(position)))) * 100 as unrealized_profit_pct,
  cost_date as acquisition_date
WHERE account_sortkey(account) ~ "^[01]"
GROUP BY account, cost_date, currency, cost_currency, cost_number, account_sortkey(account)
ORDER BY account_sortkey(account), currency, cost_date
"""

HOLDINGS_BY_ACCOUNT_QUERY = """
SELECT
  account,
  units(sum(position)) as units,
  cost(sum(position)) as book_value,
  value(sum(position), today()) as market_value,
  safediv((abs(sum(number(value(position, today())))) - abs(sum(number(cost(position))))), sum(number(cost(position)))) * 100 as unrealized_profit_pct
WHERE account_sortkey(account) ~ "^[01]"
GROUP BY account, cost_currency, account_sortkey(account), currency
ORDER BY account_sortkey(account), currency
"""

HOLDINGS_BY_CURRENCY_QUERY = """
SELECT
  units(sum(position)) as units,
  safediv(number(only(first(cost_currency), cost(sum(position)))), number(only(first(currency), units(sum(position))))) as average_cost,
  first(getprice(currency, cost_currency, today())) as price,
  cost(sum(position)) as book_value,
  value(sum(position), today()) as market_value,
  safediv((abs(sum(number(value(position, today())))) - abs(sum(number(cost(position))))), sum(number(cost(position)))) * 100 as unrealized_profit_pct
WHERE account_sortkey(account) ~ "^[01]"
GROUP BY currency, cost_currency
ORDER BY currency, cost_currency
"""


def _serialise_query_result(result: QueryResultTable | QueryResultText) -> dict[str, Any]:
    if isinstance(result, QueryResultText):
        return {"type": "text", "contents": result.contents}
    columns = [{"name": c.name, "dtype": c.dtype} for c in result.types]
    # `execute_query_serialised` already applied each column's serialiser.
    rows = [[to_jsonable(v) for v in row] for row in result.rows]
    return {"type": "table", "columns": columns, "rows": rows}


def run_query(
    ledger: FavaLedger, q: ReportQuery, query_string: str, *, max_rows: int = 5000
) -> dict[str, Any]:
    filtered = get_filtered(ledger, q)
    try:
        result = ledger.query_shell.execute_query_serialised(
            filtered.entries_with_all_prices, query_string
        )
    except FavaAPIError as exc:
        raise LedgerError(str(exc)) from exc
    payload = _serialise_query_result(result)
    if payload["type"] == "table":
        total = len(payload["rows"])
        payload["rows"] = payload["rows"][:max_rows]
        payload["truncated"] = total > max_rows
        payload["rowCount"] = total
    return payload


def holdings(ledger: FavaLedger, q: ReportQuery, *, group_by: str = "lot") -> dict[str, Any]:
    query_string = {
        "lot": HOLDINGS_QUERY,
        "account": HOLDINGS_BY_ACCOUNT_QUERY,
        "currency": HOLDINGS_BY_CURRENCY_QUERY,
    }.get(group_by)
    if query_string is None:
        raise ValidationError("groupBy must be one of lot, account, currency")
    return run_query(ledger, q, query_string)


def payee_accounts(ledger: FavaLedger, payee: str) -> list[str]:
    return list(ledger.attributes.payee_accounts(payee))


def payee_transaction(ledger: FavaLedger, payee: str) -> dict[str, Any] | None:
    entry = ledger.attributes.payee_transaction(payee)
    return serialise_entry(ledger, entry) if entry else None


def narration_transaction(ledger: FavaLedger, narration: str) -> dict[str, Any] | None:
    entry = ledger.attributes.narration_transaction(narration)
    return serialise_entry(ledger, entry) if entry else None


# ----------------------------------------------------------------------- writes


def source_slice(ledger: FavaLedger, entry_hash: str) -> dict[str, str]:
    try:
        entry = ledger.get_entry(entry_hash)
    except FavaAPIError as exc:
        raise NotFoundError(str(exc)) from exc
    try:
        text, sha = get_entry_slice(entry)
    except (KeyError, FileNotFoundError, ValueError) as exc:
        raise LedgerError(
            "This entry has no editable source (it was generated by a plugin)"
        ) from exc
    return {"slice": text, "sha256sum": sha}


def save_slice(ledger: FavaLedger, entry_hash: str, source: str, sha256sum: str) -> str:
    try:
        return ledger.file.save_entry_slice(entry_hash, source, sha256sum)
    except FavaAPIError as exc:
        raise LedgerError(str(exc)) from exc


def delete_slice(ledger: FavaLedger, entry_hash: str, sha256sum: str) -> None:
    try:
        ledger.file.delete_entry_slice(entry_hash, sha256sum)
    except FavaAPIError as exc:
        raise LedgerError(str(exc)) from exc


def insert_entries(ledger: FavaLedger, entries: Sequence[Any]) -> list[str]:
    """Insert Beancount directives (already-constructed objects).

    Returns the hashes of the entries as *loaded* from disk (auto-balanced postings change the
    hash), found by diffing the ledger's entry hashes before and after the write.
    """
    before = {hash_entry(e) for e in ledger.all_entries}
    try:
        ledger.file.insert_entries(entries)
    except FavaAPIError as exc:
        raise LedgerError(str(exc)) from exc
    ledger.changed()
    return [h for h in (hash_entry(e) for e in ledger.all_entries) if h not in before]


def format_source(ledger: FavaLedger, source: str) -> str:
    from fava.core.misc import align

    return align(source, ledger.fava_options.currency_column)


def entry_filename_for(ledger: FavaLedger, entry_hash: str) -> str | None:
    try:
        entry = ledger.get_entry(entry_hash)
    except FavaAPIError:
        return None
    return _relative_filename(ledger, entry.meta.get("filename"))


def default_file(ledger: FavaLedger) -> str:
    return (
        _relative_filename(ledger, ledger.fava_options.default_file or ledger.beancount_file_path)
        or "main.bean"
    )


def transactions_for_dedup(ledger: FavaLedger) -> set[tuple[str, str, str, str]]:
    """(date, account, number, currency) tuples over all postings, for import de-duplication."""
    seen: set[tuple[str, str, str, str]] = set()
    for txn in ledger.all_entries_by_type.Transaction:
        for p in txn.postings:
            if p.units is None or p.units is MISSING:
                continue
            seen.add((txn.date.isoformat(), p.account, str(p.units.number), p.units.currency))
    return seen


def is_balance(entry: Any) -> bool:
    return isinstance(entry, Balance)


def is_custom(entry: Any) -> bool:
    return isinstance(entry, Custom)


__all__ = [
    "ENTRY_TYPES",
    "ReportQuery",
    "account_journal",
    "account_report",
    "accounts_detail",
    "attributes",
    "balance_sheet",
    "budgets",
    "cash_flow",
    "commodities",
    "default_file",
    "delete_slice",
    "documents",
    "entry_context",
    "entry_filename_for",
    "errors",
    "events",
    "format_source",
    "holdings",
    "income_statement",
    "insert_entries",
    "interval_totals",
    "journal",
    "ledger_meta",
    "narration_transaction",
    "options_report",
    "overview",
    "payee_accounts",
    "payee_transaction",
    "plaintext_journal",
    "run_query",
    "save_slice",
    "serialise_entry",
    "source_slice",
    "statistics",
    "to_jsonable",
    "transactions_for_dedup",
    "trial_balance",
]
