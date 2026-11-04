"""Documents the assistant makes for the user: HTML, PDF, Excel and Word.

A document is a title, a short write-up in a small Markdown subset (`#` headings, `-` bullets,
paragraphs) and tables. The tables always come from BQL queries the server ran on the ledger
(see `create_document` in tools.py), never from numbers the model typed, so every figure in a
document is the ledger's own. Rendering is pure: bytes in memory, no ledger access here.
"""

from __future__ import annotations

import html
import io
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from app.logging_setup import get_logger

log = get_logger(__name__)

Format = Literal["html", "pdf", "xlsx", "docx"]
FORMATS: dict[str, tuple[str, str]] = {
    "html": ("html", "text/html; charset=utf-8"),
    "pdf": ("pdf", "application/pdf"),
    "xlsx": ("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "docx": ("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
}
# A Unicode face for PDFs where the system has one (the API image installs DejaVu); otherwise
# the PDF falls back to Helvetica, which covers Latin-1 only.
PDF_FONT_CANDIDATES = (
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/Library/Fonts/Arial Unicode.ttf"),
    Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
)


@dataclass(frozen=True)
class Block:
    kind: Literal["heading", "bullet", "paragraph"]
    text: str


@dataclass(frozen=True)
class DocumentTable:
    title: str
    columns: list[str]
    rows: list[list[Any]]


def parse_markdown(body: str) -> list[Block]:
    """The write-up as blocks: `#` lines are headings, `-`/`*` lines bullets, the rest paragraphs."""
    blocks: list[Block] = []
    paragraph: list[str] = []

    def flush() -> None:
        if paragraph:
            blocks.append(Block("paragraph", " ".join(paragraph)))
            paragraph.clear()

    for raw in (body or "").splitlines():
        line = raw.strip()
        if not line:
            flush()
        elif line.startswith("#"):
            flush()
            blocks.append(Block("heading", line.lstrip("#").strip()))
        elif line[:2] in ("- ", "* "):
            flush()
            blocks.append(Block("bullet", line[2:].strip()))
        else:
            paragraph.append(line)
    flush()
    return blocks


def _amount(number: Any, currency: str) -> str:
    return f"{float(number):,.2f} {currency}"


def cell_text(value: Any) -> str:
    """A query cell as the ledger would print it: amounts with their currency, lists joined."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, float):
        return f"{value:,.2f}"
    if isinstance(value, dict):
        if "number" in value and "currency" in value and value["number"] is not None:
            return _amount(value["number"], value["currency"])
        # An inventory: {currency: number}.
        if value and all(isinstance(v, (int, float)) for v in value.values()):
            return ", ".join(_amount(n, c) for c, n in value.items())
        return ", ".join(f"{k}: {cell_text(v)}" for k, v in value.items())
    if isinstance(value, list):
        return ", ".join(cell_text(v) for v in value)
    return str(value)


# ---------------------------------------------------------------- renderers


def _html(title: str, blocks: list[Block], tables: list[DocumentTable]) -> bytes:
    esc = html.escape
    parts = [
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>",
        "<meta name='viewport' content='width=device-width, initial-scale=1'>",
        f"<title>{esc(title)}</title><style>",
        "body{font:15px/1.45 -apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;color:#1d1d1f;"
        "background:#fff;margin:0 auto;max-width:860px;padding:48px 24px}",
        "h1{font-size:34px;letter-spacing:-.022em;margin:0 0 24px}h2{font-size:20px;margin:32px 0 8px}",
        "table{border-collapse:collapse;width:100%;margin:8px 0 24px;font-variant-numeric:tabular-nums}",
        "th{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6e6e73;"
        "text-align:left;padding:6px 8px;border-bottom:1px solid #d2d2d7}",
        "td{padding:6px 8px;border-bottom:1px solid #f0f0f2}h3{font-size:15px;margin:24px 0 4px}",
        "@media (prefers-color-scheme:dark){body{background:#000;color:#f5f5f7}th{color:#a1a1a6;"
        "border-color:#38383a}td{border-color:#1c1c1e}}",
        f"</style></head><body><h1>{esc(title)}</h1>",
    ]
    in_list = False
    for block in blocks:
        if block.kind == "bullet" and not in_list:
            parts.append("<ul>")
            in_list = True
        if block.kind != "bullet" and in_list:
            parts.append("</ul>")
            in_list = False
        tag = {"heading": "h2", "bullet": "li", "paragraph": "p"}[block.kind]
        parts.append(f"<{tag}>{esc(block.text)}</{tag}>")
    if in_list:
        parts.append("</ul>")
    for table in tables:
        parts.append(f"<h3>{esc(table.title)}</h3><table><thead><tr>")
        parts.extend(f"<th>{esc(c)}</th>" for c in table.columns)
        parts.append("</tr></thead><tbody>")
        for row in table.rows:
            parts.append("<tr>" + "".join(f"<td>{esc(cell_text(v))}</td>" for v in row) + "</tr>")
        parts.append("</tbody></table>")
    parts.append("</body></html>")
    return "".join(parts).encode()


def _pdf(title: str, blocks: list[Block], tables: list[DocumentTable]) -> bytes:
    from fpdf import FPDF
    from fpdf.fonts import FontFace

    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    font = next((p for p in PDF_FONT_CANDIDATES if p.exists()), None)
    if font is not None:
        pdf.add_font("Body", "", str(font))
        family, bullet, clean = "Body", "•", (lambda s: s)
    else:
        log.warning("no Unicode font for PDFs; characters outside Latin-1 become '?'")
        family, bullet = "Helvetica", "-"

        def clean(s: str) -> str:
            return s.encode("latin-1", "replace").decode("latin-1")

    pdf.set_font(family, size=22)
    pdf.multi_cell(0, 10, clean(title), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    for block in blocks:
        if block.kind == "heading":
            pdf.ln(2)
            pdf.set_font(family, size=14)
            pdf.multi_cell(0, 8, clean(block.text), new_x="LMARGIN", new_y="NEXT")
        else:
            pdf.set_font(family, size=11)
            text = f"{bullet}  {block.text}" if block.kind == "bullet" else block.text
            pdf.multi_cell(0, 6, clean(text), new_x="LMARGIN", new_y="NEXT")
    for table in tables:
        pdf.ln(4)
        pdf.set_font(family, size=13)
        pdf.multi_cell(0, 8, clean(table.title), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font(family, size=9)
        # Headings in grey rather than bold: only the regular face is registered, and grey
        # labels match the app's table headers.
        headings = FontFace(emphasis="", color=(110, 110, 115))
        with pdf.table(first_row_as_headings=True, headings_style=headings, line_height=6) as grid:
            header = grid.row()
            for column in table.columns:
                header.cell(clean(column))
            for row in table.rows:
                cells = grid.row()
                for value in row:
                    cells.cell(clean(cell_text(value)))
    return bytes(pdf.output())


def _sheet_title(title: str, used: set[str]) -> str:
    """Excel sheet names: at most 31 characters, none of []:*?/\\, unique in the workbook."""
    base = "".join("-" if ch in "[]:*?/\\" else ch for ch in title).strip()[:31] or "Sheet"
    name, n = base, 2
    while name in used:
        suffix = f" ({n})"
        name, n = base[: 31 - len(suffix)] + suffix, n + 1
    used.add(name)
    return name


def _xlsx(title: str, blocks: list[Block], tables: list[DocumentTable]) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font

    book = Workbook()
    used: set[str] = set()
    summary = book.active
    summary.title = _sheet_title("Summary", used)
    summary.append([title])
    summary["A1"].font = Font(bold=True, size=16)
    for block in blocks:
        summary.append([f"• {block.text}" if block.kind == "bullet" else block.text])
        if block.kind == "heading":
            summary.cell(summary.max_row, 1).font = Font(bold=True)
    for table in tables:
        sheet = book.create_sheet(_sheet_title(table.title, used))
        sheet.append(table.columns)
        for cell in sheet[1]:
            cell.font = Font(bold=True)
        for row in table.rows:
            sheet.append([None] * len(row))
            for col, value in enumerate(row, start=1):
                cell = sheet.cell(sheet.max_row, col)
                # Amounts stay numbers (so they sum and chart), formatted with their currency.
                if (
                    isinstance(value, dict)
                    and value.get("number") is not None
                    and "currency" in value
                ):
                    cell.value = float(value["number"])
                    cell.number_format = f'#,##0.00 "{value["currency"]}"'
                elif isinstance(value, (int, float)) and not isinstance(value, bool):
                    cell.value = value
                else:
                    cell.value = cell_text(value)
        for column in sheet.columns:
            width = max(len(str(c.value or "")) for c in column)
            sheet.column_dimensions[column[0].column_letter].width = min(max(width + 2, 10), 60)
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


def _docx(title: str, blocks: list[Block], tables: list[DocumentTable]) -> bytes:
    from docx import Document

    doc = Document()
    doc.add_heading(title, level=0)
    for block in blocks:
        if block.kind == "heading":
            doc.add_heading(block.text, level=1)
        elif block.kind == "bullet":
            doc.add_paragraph(block.text, style="List Bullet")
        else:
            doc.add_paragraph(block.text)
    for table in tables:
        doc.add_heading(table.title, level=2)
        grid = doc.add_table(rows=1, cols=len(table.columns))
        grid.style = "Light List"
        for cell, column in zip(grid.rows[0].cells, table.columns, strict=True):
            cell.text = column
        for row in table.rows:
            for cell, value in zip(grid.add_row().cells, row, strict=False):
                cell.text = cell_text(value)
    out = io.BytesIO()
    doc.save(out)
    return out.getvalue()


RENDERERS = {"html": _html, "pdf": _pdf, "xlsx": _xlsx, "docx": _docx}


def build_document(fmt: str, title: str, body: str, tables: list[DocumentTable]) -> bytes:
    renderer = RENDERERS.get(fmt)
    if renderer is None:
        raise ValueError(f"Unknown document format {fmt!r}; use one of {', '.join(RENDERERS)}")
    return renderer(title, parse_markdown(body), tables)
