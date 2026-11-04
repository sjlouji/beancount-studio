"""Documents the assistant makes: each format renders the write-up and the query tables."""

from __future__ import annotations

import io

import pytest
from docx import Document as WordDocument
from openpyxl import load_workbook

from app.ai.documents import DocumentTable, build_document, cell_text, parse_markdown

BODY = """# Spending in March

Groceries were the largest category.

- Food is up on February
- Rent is unchanged
"""

TABLES = [
    DocumentTable(
        title="Top payees",
        columns=["payee", "total"],
        rows=[
            ["Whole Foods", {"number": 412.5, "currency": "USD"}],
            ["<script>alert(1)</script>", {"number": 1200.0, "currency": "USD"}],
        ],
    )
]


def test_cells_read_like_the_ledger() -> None:
    assert cell_text({"number": 1234.5, "currency": "USD"}) == "1,234.50 USD"
    assert cell_text({"USD": 10.0, "EUR": -2.5}) == "10.00 USD, -2.50 EUR"
    assert cell_text(None) == ""
    assert cell_text(["a", "b"]) == "a, b"
    assert cell_text("2026-03-01") == "2026-03-01"


def test_markdown_becomes_headings_bullets_and_paragraphs() -> None:
    blocks = parse_markdown(BODY)
    assert [(b.kind, b.text) for b in blocks] == [
        ("heading", "Spending in March"),
        ("paragraph", "Groceries were the largest category."),
        ("bullet", "Food is up on February"),
        ("bullet", "Rent is unchanged"),
    ]


def test_html_escapes_everything_it_is_given() -> None:
    data = build_document("html", "Q1 <review>", BODY, TABLES)
    html = data.decode()
    assert "<title>Q1 &lt;review&gt;</title>" in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "<script>" not in html
    assert "1,200.00 USD" in html


def test_pdf_is_a_pdf() -> None:
    data = build_document("pdf", "Q1 review", BODY, TABLES)
    assert data.startswith(b"%PDF")


def test_xlsx_keeps_amounts_as_numbers() -> None:
    data = build_document("xlsx", "Q1 review", BODY, TABLES)
    book = load_workbook(io.BytesIO(data))
    sheet = book["Top payees"]
    assert [c.value for c in sheet[1]] == ["payee", "total"]
    assert sheet["B2"].value == pytest.approx(412.5)
    assert "USD" in sheet["B2"].number_format


def test_docx_has_the_heading_and_the_table() -> None:
    data = build_document("docx", "Q1 review", BODY, TABLES)
    doc = WordDocument(io.BytesIO(data))
    texts = [p.text for p in doc.paragraphs]
    assert "Q1 review" in texts and "Spending in March" in texts
    table = doc.tables[0]
    assert table.cell(0, 0).text == "payee"
    assert table.cell(1, 1).text == "412.50 USD"


def test_unknown_format_is_refused() -> None:
    with pytest.raises(ValueError, match="format"):
        build_document("pptx", "x", "", [])
