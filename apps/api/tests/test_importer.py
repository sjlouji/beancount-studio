from __future__ import annotations

from decimal import Decimal

from httpx import AsyncClient

from app.importers.csv_import import (
    detect_mapping,
    parse_amount_token,
    parse_csv,
    parse_date_token,
    render_transaction,
)


def test_amount_parsing():
    assert parse_amount_token("1,234.56") == (Decimal("1234.56"), None)
    assert parse_amount_token("-12.50") == (Decimal("-12.50"), None)
    assert parse_amount_token("(12.50)") == (Decimal("-12.50"), None)
    assert parse_amount_token("12,50 €") == (Decimal("12.50"), "EUR")
    assert parse_amount_token("USD 1.000,25") == (Decimal("1000.25"), "USD")
    assert parse_amount_token("") == (None, None)


def test_date_parsing():
    assert parse_date_token("2026-03-05") == "2026-03-05"
    assert parse_date_token("03/05/2026") == "2026-03-05"
    assert parse_date_token("2026-03-05T10:00:00Z") == "2026-03-05"
    assert parse_date_token("nope") is None


def test_detect_mapping_and_parse():
    csv_text = "Transaction Date,Description,Debit,Credit,Balance\n03/01/2026,COFFEE SHOP,4.50,,100.00\n03/02/2026,PAYROLL,,2500.00,2600.00\n"
    mapping = detect_mapping(["Transaction Date", "Description", "Debit", "Credit", "Balance"])
    assert (
        mapping.date == "Transaction Date"
        and mapping.debit == "Debit"
        and mapping.credit == "Credit"
    )
    parsed = parse_csv(csv_text)
    rows = parsed["rows"]
    assert parsed["validCount"] == 2
    assert rows[0]["amount"] == "-4.50" and rows[0]["payee"] == "COFFEE SHOP"
    assert rows[1]["amount"] == "2500.00"


def test_render_transaction():
    text = render_transaction(
        txn_date="2026-03-01",
        payee="Coffee",
        narration="Latte",
        amount=Decimal("-4.50"),
        currency="USD",
        source_account="Assets:Bank:Checking",
        target_account="Expenses:Food:Coffee",
    )
    assert text.startswith('2026-03-01 * "Coffee" "Latte"\n')
    assert "Assets:Bank:Checking" in text and "-4.50 USD" in text and "4.50 USD" in text


async def test_import_roundtrip(client: AsyncClient, user: dict, ledger: dict):
    owner, slug = ledger["owner"], ledger["slug"]
    base = f"/api/ledgers/{owner}/{slug}/imports"
    csv_bytes = (
        b"Date,Description,Amount\n2025-12-03,Blue Bottle,-6.25\n2025-12-04,Salary,3000.00\n"
    )
    parsed = await client.post(f"{base}/parse", files={"file": ("bank.csv", csv_bytes, "text/csv")})
    assert parsed.status_code == 200, parsed.text
    rows = parsed.json()["rows"]
    assert len(rows) == 2 and rows[0]["payee"] == "Blue Bottle"

    cat = await client.post(
        f"{base}/categorize",
        json={"rows": rows, "sourceAccount": "Assets:US:BofA:Checking", "useAi": False},
    )
    assert cat.status_code == 200

    commit = await client.post(
        f"{base}/commit",
        json={
            "sourceAccount": "Assets:US:BofA:Checking",
            "rows": [
                {
                    "id": 0,
                    "date": "2025-12-03",
                    "payee": "Blue Bottle",
                    "amount": "-6.25",
                    "currency": "USD",
                    "targetAccount": "Expenses:Food:Coffee",
                },
                {
                    "id": 1,
                    "date": "2025-12-04",
                    "payee": "Salary",
                    "amount": "3000.00",
                    "currency": "USD",
                    "targetAccount": "Income:US:Babble:Salary",
                },
            ],
        },
    )
    assert commit.status_code == 201, commit.text
    assert commit.json()["written"] == 2 and commit.json()["errors"] == []

    again = await client.post(
        f"{base}/commit",
        json={
            "sourceAccount": "Assets:US:BofA:Checking",
            "rows": [
                {
                    "id": 0,
                    "date": "2025-12-03",
                    "payee": "Blue Bottle",
                    "amount": "-6.25",
                    "currency": "USD",
                    "targetAccount": "Expenses:Food:Coffee",
                }
            ],
        },
    )
    assert again.json()["written"] == 0 and again.json()["skipped"] == [0]
