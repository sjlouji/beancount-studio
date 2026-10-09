"""CSV/OFX/QIF statement parsing with column detection, plus de-duplication against the ledger.

The flow is: parse (detect columns, normalise rows) -> user maps accounts -> commit (write
transactions). Rows are kept as strings until commit so no precision is lost.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from app.errors import ValidationError

DATE_FORMATS = (
    "%Y-%m-%d",
    "%m/%d/%Y",
    "%d/%m/%Y",
    "%Y/%m/%d",
    "%d.%m.%Y",
    "%m-%d-%Y",
    "%d-%m-%Y",
    "%b %d, %Y",
    "%d %b %Y",
    "%Y%m%d",
    "%m/%d/%y",
    "%d/%m/%y",
)

DATE_HEADERS = (
    "date",
    "transaction date",
    "posted date",
    "posting date",
    "booking date",
    "value date",
    "trans date",
    "fecha",
    "datum",
)
AMOUNT_HEADERS = (
    "amount",
    "transaction amount",
    "value",
    "sum",
    "total",
    "betrag",
    "montant",
    "importe",
)
DEBIT_HEADERS = (
    "debit",
    "withdrawal",
    "withdrawals",
    "money out",
    "paid out",
    "out",
    "charge",
    "soll",
)
CREDIT_HEADERS = ("credit", "deposit", "deposits", "money in", "paid in", "in", "haben")
PAYEE_HEADERS = (
    "payee",
    "merchant",
    "name",
    "counterparty",
    "vendor",
    "beneficiary",
    "description",
    "memo",
    "details",
    "narrative",
    "transaction",
    "reference",
    "concepto",
)
DESC_HEADERS = (
    "description",
    "memo",
    "details",
    "narration",
    "narrative",
    "notes",
    "reference",
    "remarks",
    "text",
    "verwendungszweck",
)
BALANCE_HEADERS = ("balance", "running balance", "saldo")


@dataclass
class ColumnMapping:
    date: str | None = None
    amount: str | None = None
    debit: str | None = None
    credit: str | None = None
    payee: str | None = None
    description: str | None = None
    balance: str | None = None
    invert_amount: bool = False

    def to_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


@dataclass
class ParsedRow:
    id: int
    date: str | None
    payee: str
    description: str
    amount: str | None
    currency: str | None
    raw: dict[str, str]
    errors: list[str] = field(default_factory=list)
    balance: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "date": self.date,
            "payee": self.payee,
            "description": self.description,
            "amount": self.amount,
            "currency": self.currency,
            "balance": self.balance,
            "raw": self.raw,
            "errors": self.errors,
        }


def parse_date_token(value: str) -> str | None:
    value = value.strip()
    if not value:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            continue
    match = re.match(r"^(\d{4}-\d{2}-\d{2})[T ]", value)
    if match:
        return match.group(1)
    return None


_AMOUNT_CLEAN = re.compile(r"[^\d.,\-()+]")


def parse_amount_token(value: str) -> tuple[Decimal | None, str | None]:
    """Parse '1,234.56', '-12.50', '(12.50)', '12,50 €', 'USD 12.50'. Returns (number, currency)."""
    raw = value.strip()
    if not raw:
        return None, None
    currency = None
    cur_match = re.search(r"\b([A-Z]{3})\b", raw)
    if cur_match:
        currency = cur_match.group(1)
    for symbol, code in (("$", "USD"), ("€", "EUR"), ("£", "GBP"), ("¥", "JPY"), ("₹", "INR")):
        if symbol in raw and currency is None:
            currency = code
    cleaned = _AMOUNT_CLEAN.sub("", raw)
    negative = cleaned.startswith("(") and cleaned.endswith(")")
    cleaned = cleaned.strip("()")
    if cleaned.count(",") and cleaned.count("."):
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif cleaned.count(","):
        parts = cleaned.split(",")
        if len(parts[-1]) == 2 and len(parts) == 2:
            cleaned = cleaned.replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    if not cleaned or cleaned in ("-", "+", "."):
        return None, currency
    try:
        number = Decimal(cleaned)
    except InvalidOperation:
        return None, currency
    if negative:
        number = -number
    return number, currency


def _norm(header: str) -> str:
    return re.sub(r"\s+", " ", header.strip().lower().replace("_", " "))


def detect_mapping(headers: list[str]) -> ColumnMapping:
    normalised = {h: _norm(h) for h in headers}

    def find(candidates: tuple[str, ...], exclude: set[str] | None = None) -> str | None:
        for cand in candidates:
            for original, norm in normalised.items():
                if exclude and original in exclude:
                    continue
                if norm == cand:
                    return original
        for cand in candidates:
            for original, norm in normalised.items():
                if exclude and original in exclude:
                    continue
                if cand in norm:
                    return original
        return None

    mapping = ColumnMapping()
    mapping.date = find(DATE_HEADERS)
    mapping.amount = find(AMOUNT_HEADERS)
    mapping.debit = find(DEBIT_HEADERS)
    mapping.credit = find(CREDIT_HEADERS)
    if mapping.amount and mapping.amount in (mapping.debit, mapping.credit):
        mapping.amount = None
    used = {c for c in (mapping.date, mapping.amount, mapping.debit, mapping.credit) if c}
    mapping.payee = find(PAYEE_HEADERS, used)
    used.add(mapping.payee) if mapping.payee else None
    mapping.description = find(DESC_HEADERS, used)
    if mapping.description == mapping.payee:
        mapping.description = None
    mapping.balance = find(BALANCE_HEADERS, used)
    return mapping


def sniff_dialect(sample: str) -> csv.Dialect | type[csv.Dialect]:
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        return csv.excel


def parse_csv(text: str, mapping: ColumnMapping | None = None) -> dict[str, Any]:
    text = text.lstrip("﻿")
    if not text.strip():
        raise ValidationError("The file is empty")
    dialect = sniff_dialect(text[:4096])
    reader = csv.reader(io.StringIO(text), dialect)
    rows = [r for r in reader if any(cell.strip() for cell in r)]
    if not rows:
        raise ValidationError("No rows found in the file")
    # Find the header row: first row with >= 2 non-numeric cells and no parseable date.
    header_index = 0
    for i, row in enumerate(rows[:10]):
        has_date = any(parse_date_token(c) for c in row)
        texty = sum(1 for c in row if c.strip() and parse_amount_token(c)[0] is None)
        if not has_date and texty >= 2:
            header_index = i
            break
    headers = [h.strip() or f"column{i + 1}" for i, h in enumerate(rows[header_index])]
    data_rows = rows[header_index + 1 :]
    mapping = mapping or detect_mapping(headers)
    parsed = [_row_from_mapping(i, headers, row, mapping) for i, row in enumerate(data_rows)]
    currencies = {r.currency for r in parsed if r.currency}
    return {
        "headers": headers,
        "mapping": mapping.to_dict(),
        "rows": [r.to_dict() for r in parsed],
        "detectedCurrency": next(iter(currencies)) if len(currencies) == 1 else None,
        "validCount": sum(1 for r in parsed if not r.errors),
        "format": "csv",
    }


def _row_from_mapping(
    index: int, headers: list[str], row: list[str], mapping: ColumnMapping
) -> ParsedRow:
    cells = {h: (row[i] if i < len(row) else "") for i, h in enumerate(headers)}
    errors: list[str] = []
    date_value = parse_date_token(cells.get(mapping.date or "", "")) if mapping.date else None
    if not date_value:
        errors.append("Unrecognised date")
    number: Decimal | None = None
    currency: str | None = None
    if mapping.amount:
        number, currency = parse_amount_token(cells.get(mapping.amount, ""))
    elif mapping.debit or mapping.credit:
        debit, cur1 = (
            parse_amount_token(cells.get(mapping.debit or "", ""))
            if mapping.debit
            else (None, None)
        )
        credit, cur2 = (
            parse_amount_token(cells.get(mapping.credit or "", ""))
            if mapping.credit
            else (None, None)
        )
        currency = cur1 or cur2
        if debit is not None and debit != 0:
            number = -abs(debit)
        elif credit is not None:
            number = abs(credit)
    if number is None:
        errors.append("Unrecognised amount")
    elif mapping.invert_amount:
        number = -number
    payee = cells.get(mapping.payee or "", "").strip() if mapping.payee else ""
    description = cells.get(mapping.description or "", "").strip() if mapping.description else ""
    if not payee and description:
        payee, description = description, ""
    balance = None
    if mapping.balance:
        bal, _ = parse_amount_token(cells.get(mapping.balance, ""))
        balance = str(bal) if bal is not None else None
    return ParsedRow(
        id=index,
        date=date_value,
        payee=payee,
        description=description,
        amount=str(number) if number is not None else None,
        currency=currency,
        raw=cells,
        errors=errors,
        balance=balance,
    )


# ------------------------------------------------------------------------- OFX/QIF


def parse_ofx(text: str) -> dict[str, Any]:
    """Minimal OFX/QFX parser: STMTTRN blocks with DTPOSTED, TRNAMT, NAME/MEMO, FITID."""
    blocks = re.findall(r"<STMTTRN>(.*?)</STMTTRN>", text, flags=re.S | re.I)
    if not blocks:
        raise ValidationError("No transactions found in the OFX file")
    currency_match = re.search(r"<CURDEF>\s*([A-Z]{3})", text, re.I)
    currency = currency_match.group(1).upper() if currency_match else None
    rows: list[ParsedRow] = []

    def tag(block: str, name: str) -> str:
        m = re.search(rf"<{name}>\s*([^<\r\n]*)", block, re.I)
        return m.group(1).strip() if m else ""

    for i, block in enumerate(blocks):
        posted = tag(block, "DTPOSTED")[:8]
        d = parse_date_token(posted)
        amount, _ = parse_amount_token(tag(block, "TRNAMT"))
        name = tag(block, "NAME")
        memo = tag(block, "MEMO")
        errors = []
        if not d:
            errors.append("Unrecognised date")
        if amount is None:
            errors.append("Unrecognised amount")
        rows.append(
            ParsedRow(
                id=i,
                date=d,
                payee=name or memo,
                description=memo if name else "",
                amount=str(amount) if amount is not None else None,
                currency=currency,
                raw={
                    "fitid": tag(block, "FITID"),
                    "type": tag(block, "TRNTYPE"),
                    "name": name,
                    "memo": memo,
                },
                errors=errors,
            )
        )
    return {
        "headers": ["date", "payee", "memo", "amount"],
        "mapping": ColumnMapping(
            date="date", amount="amount", payee="payee", description="memo"
        ).to_dict(),
        "rows": [r.to_dict() for r in rows],
        "detectedCurrency": currency,
        "validCount": sum(1 for r in rows if not r.errors),
        "format": "ofx",
    }


def parse_qif(text: str) -> dict[str, Any]:
    rows: list[ParsedRow] = []
    current: dict[str, str] = {}
    index = 0
    for line in text.splitlines():
        if not line.strip():
            continue
        code, value = line[0], line[1:].strip()
        if code == "^":
            if current:
                d = parse_date_token(current.get("D", "").replace("'", "/"))
                amount, _ = parse_amount_token(current.get("T", current.get("U", "")))
                errors = []
                if not d:
                    errors.append("Unrecognised date")
                if amount is None:
                    errors.append("Unrecognised amount")
                rows.append(
                    ParsedRow(
                        id=index,
                        date=d,
                        payee=current.get("P", ""),
                        description=current.get("M", ""),
                        amount=str(amount) if amount is not None else None,
                        currency=None,
                        raw=dict(current),
                        errors=errors,
                    )
                )
                index += 1
            current = {}
        elif code == "!":
            continue
        else:
            current[code] = value
    if not rows:
        raise ValidationError("No transactions found in the QIF file")
    return {
        "headers": ["D", "P", "M", "T"],
        "mapping": ColumnMapping(date="D", amount="T", payee="P", description="M").to_dict(),
        "rows": [r.to_dict() for r in rows],
        "detectedCurrency": None,
        "validCount": sum(1 for r in rows if not r.errors),
        "format": "qif",
    }


def parse_statement(
    filename: str, data: bytes, mapping: ColumnMapping | None = None
) -> dict[str, Any]:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("latin-1")
    lower = filename.lower()
    if lower.endswith((".ofx", ".qfx")) or "<OFX>" in text.upper()[:2000]:
        return parse_ofx(text)
    if lower.endswith(".qif"):
        return parse_qif(text)
    return parse_csv(text, mapping)


# -------------------------------------------------------------------- rendering


def render_transaction(
    *,
    txn_date: str,
    payee: str,
    narration: str,
    amount: Decimal,
    currency: str,
    source_account: str,
    target_account: str,
    flag: str = "*",
    tags: list[str] | None = None,
    meta: dict[str, str] | None = None,
    currency_column: int = 61,
) -> str:
    """Render a two-posting transaction as Beancount text."""

    def quote(value: str) -> str:
        return '"' + value.replace('"', "'") + '"'

    header = f"{txn_date} {flag}"
    if payee:
        header += f" {quote(payee)}"
    header += f" {quote(narration)}"
    if tags:
        header += " " + " ".join(f"#{t.lstrip('#')}" for t in tags)
    lines = [header]
    for key, value in (meta or {}).items():
        lines.append(f"  {key}: {quote(str(value))}")

    def posting(account: str, number: Decimal) -> str:
        number_str = f"{number:f}"
        left = f"  {account}"
        width = max(currency_column - len(left) - len(number_str) - 1, 2)
        return f"{left}{' ' * width}{number_str} {currency}"

    lines.append(posting(source_account, amount))
    lines.append(posting(target_account, -amount))
    return "\n".join(lines) + "\n"


def dedup_key(
    txn_date: str, account: str, amount: Decimal, currency: str
) -> tuple[str, str, str, str]:
    return (txn_date, account, str(amount), currency)


def insertion_text(entries_text: list[str]) -> str:
    return "\n".join(entries_text)
