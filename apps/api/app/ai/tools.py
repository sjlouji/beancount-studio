"""Tool definitions and executors for the ledger assistant.

All write operations go through `edit_ledger_files`, which refuses to commit unless the
conversation contains an approved `request_approval` call for the exact same operations.
`request_approval` itself is a *frontend* tool: the UI renders the diff and the user decides.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from app.core.deps import LedgerAccess, author_for
from app.errors import AppError
from app.ledgers import engine
from app.ledgers.engine import ReportQuery
from app.ledgers.store import LedgerStore, safe_relative_path
from app.logging_setup import get_logger

log = get_logger(__name__)

MAX_QUERY_ROWS = 200
MAX_FILE_LINES = 1500

APPROVAL_TOOL = "request_approval"


def operations_hash(files: list[dict[str, Any]]) -> str:
    canonical = json.dumps(files, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


_FILE_OP_SCHEMA = {
    "type": "array",
    "minItems": 1,
    "items": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "operation": {
                "type": "string",
                "enum": ["create", "update", "replace", "delete", "append"],
            },
            "path": {
                "type": "string",
                "description": "File path relative to the ledger root, e.g. main.bean",
            },
            "content": {
                "type": "string",
                "description": "Full text for create/replace, or text to append for append",
            },
            "old_string": {
                "type": "string",
                "description": "update only: exact text to replace (must occur exactly once)",
            },
            "new_string": {"type": "string", "description": "update only: replacement text"},
        },
        "required": ["operation", "path"],
    },
}

READ_TOOLS: list[dict[str, Any]] = [
    {
        "name": "get_ledger_summary",
        "description": "Get the ledger's title, operating currencies, root account names, open accounts, payees, tags, years, source files, error count and last transaction date. Call this first to learn the ledger's conventions.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "run_bql_query",
        "description": (
            "Execute a Beancount Query Language (BQL) query and get a table. "
            'BQL: SELECT cols [WHERE expr] [GROUP BY cols] [ORDER BY col [DESC]] [LIMIT n] | BALANCES [AT cost|value] [WHERE ...] | JOURNAL "Account". '
            "Columns: date, year, month, flag, payee, narration, account, number, currency, position, cost, change, balance, tags, links. "
            "Functions: sum(), count(), first(), last(), min(), max(), units(), cost(), value(). Operators: ~ (regex), =, !=, <, >, AND, OR, NOT. "
            "Rows are postings, not transactions. Use LIMIT to keep results small."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "The BQL query"}},
            "required": ["query"],
            "additionalProperties": False,
        },
    },
    {
        "name": "get_report",
        "description": "Get a financial report summary: income_statement, balance_sheet, or cash_flow, optionally restricted to a time period (e.g. '2026', '2026-03', '2026-01 - 2026-03') and converted to a currency.",
        "input_schema": {
            "type": "object",
            "properties": {
                "report": {
                    "type": "string",
                    "enum": ["income_statement", "balance_sheet", "cash_flow"],
                },
                "time": {
                    "type": "string",
                    "description": "Fava time filter like 2026, 2026-03, 2026-Q1, or 'month'",
                },
                "conversion": {
                    "type": "string",
                    "description": "Currency code, at_cost, at_value or units. Defaults to the first operating currency.",
                },
                "depth": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 6,
                    "description": "How many account levels to include (default 3)",
                },
            },
            "required": ["report"],
            "additionalProperties": False,
        },
    },
    {
        "name": "search_transactions",
        "description": "Find transactions whose payee, narration, account, tag or link contains a text (case-insensitive). Optional time filter. Returns the newest matches first with their entry hashes.",
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "time": {"type": "string", "description": "Optional time filter such as 2026-05"},
                "account": {
                    "type": "string",
                    "description": "Optional account filter (prefix or regex)",
                },
                "limit": {"type": "integer", "minimum": 1, "maximum": 100},
            },
            "required": ["text"],
            "additionalProperties": False,
        },
    },
    {
        "name": "list_ledger_files",
        "description": "List files and directories in the ledger repository (recursively).",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "read_ledger_file",
        "description": "Read a text file from the ledger with line numbers. Use start_line/end_line to page through large files.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "start_line": {"type": "integer", "minimum": 1},
                "end_line": {"type": "integer", "minimum": 1},
            },
            "required": ["path"],
            "additionalProperties": False,
        },
    },
    {
        "name": "check_ledger_edit",
        "description": "Preview a set of file operations WITHOUT committing: returns a unified diff per file and the bean-check errors the ledger would have afterwards. Use this to validate before asking for approval.",
        "input_schema": {
            "type": "object",
            "properties": {"files": _FILE_OP_SCHEMA},
            "required": ["files"],
            "additionalProperties": False,
        },
    },
]

WRITE_TOOLS: list[dict[str, Any]] = [
    {
        "name": "edit_ledger_files",
        "description": (
            "Commit file operations to the ledger. REQUIRES prior approval: first call request_approval with the identical "
            "`description` and `files`; only after the user approves may you call this tool with the same arguments. "
            "Operations: create (new file with content), update (replace old_string with new_string, old_string must occur exactly once), "
            "replace (overwrite whole file), append (add text at the end of the file), delete."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "description": {
                    "type": "string",
                    "description": "One sentence describing the change; used as the commit message",
                },
                "files": _FILE_OP_SCHEMA,
            },
            "required": ["description", "files"],
            "additionalProperties": False,
        },
    },
]


@dataclass
class ToolContext:
    store: LedgerStore
    access: LedgerAccess
    approved_hashes: set[str]


def _preview_ops(
    files: list[dict[str, Any]], store: LedgerStore, ledger_id: str
) -> dict[str, str | None]:
    """Resolve operations into path -> projected content (None = delete)."""
    changes: dict[str, str | None] = {}
    repo = store.paths(ledger_id).repo
    for op in files:
        kind = op.get("operation")
        path = op.get("path", "")
        target = safe_relative_path(repo, path)
        rel = target.relative_to(repo.resolve()).as_posix()
        current: str | None
        if rel in changes:
            current = changes[rel]
        elif target.exists() and target.is_file():
            current = target.read_text("utf-8")
        else:
            current = None
        if kind == "create":
            if current is not None:
                raise AppError(f"{rel} already exists; use update, replace or append")
            changes[rel] = op.get("content", "")
        elif kind == "replace":
            changes[rel] = op.get("content", "")
        elif kind == "append":
            base = current or ""
            sep = (
                ""
                if not base or base.endswith("\n\n")
                else ("\n" if base.endswith("\n") else "\n\n")
            )
            text = op.get("content", "")
            changes[rel] = base + sep + text + ("" if text.endswith("\n") else "\n")
        elif kind == "update":
            if current is None:
                raise AppError(f"{rel} does not exist")
            old = op.get("old_string", "")
            new = op.get("new_string", "")
            count = current.count(old) if old else 0
            if count != 1:
                raise AppError(f"old_string must occur exactly once in {rel} (found {count})")
            changes[rel] = current.replace(old, new, 1)
        elif kind == "delete":
            if current is None:
                raise AppError(f"{rel} does not exist")
            changes[rel] = None
        else:
            raise AppError(f"Unknown operation {kind!r}")
    return changes


def _compact_tree(node: dict[str, Any], depth: int, level: int = 0) -> list[str]:
    lines = []
    bal = node.get("balanceChildren") or {}
    amount = ", ".join(f"{v:,.2f} {k}" for k, v in bal.items()) or "0"
    lines.append(f"{'  ' * level}{node['account'] or '(root)'}: {amount}")
    if level + 1 < depth:
        for child in node.get("children", []):
            lines.extend(_compact_tree(child, depth, level + 1))
    return lines


async def execute_tool(ctx: ToolContext, name: str, args: dict[str, Any]) -> tuple[Any, bool]:
    """Run a backend tool. Returns (result, is_error)."""
    store, access = ctx.store, ctx.access
    ledger = access.ledger
    try:
        if name == "get_ledger_summary":
            meta = await store.run(ledger.id, engine.ledger_meta, ledger.main_file)
            attrs = await store.run(ledger.id, engine.attributes, ledger.main_file)
            return {
                "title": meta["title"],
                "operatingCurrencies": meta["operatingCurrencies"],
                "rootAccounts": {k: v for k, v in meta["options"].items() if k.startswith("name")},
                "sourceFiles": meta["sourceFiles"],
                "defaultFile": meta["favaOptions"]["defaultFile"] or ledger.main_file,
                "accounts": attrs["accounts"],
                "currencies": attrs["currencies"],
                "payees": attrs["payees"][:200],
                "tags": attrs["tags"],
                "years": attrs["years"],
                "errorsCount": meta["errorsCount"],
                "lastTransactionDate": meta["lastTransactionDate"],
                "transactionsCount": meta["transactionsCount"],
            }, False
        if name == "run_bql_query":
            result = await store.run(
                ledger.id,
                lambda f: engine.run_query(
                    f, ReportQuery(), args["query"], max_rows=MAX_QUERY_ROWS
                ),
                ledger.main_file,
            )
            if result["type"] == "text":
                return {"text": result["contents"][:20000]}, False
            return {
                "columns": [c["name"] for c in result["columns"]],
                "rows": result["rows"],
                "rowCount": result["rowCount"],
                "truncated": result["truncated"],
            }, False
        if name == "get_report":
            conversion = args.get("conversion") or None
            if not conversion:
                meta = await store.run(ledger.id, engine.ledger_meta, ledger.main_file)
                conversion = (meta["operatingCurrencies"] or ["at_cost"])[0]
            q = ReportQuery(time=args.get("time") or None, conversion=conversion)
            depth = int(args.get("depth") or 3)
            report = args["report"]
            if report == "income_statement":
                data = await store.run(
                    ledger.id, lambda f: engine.income_statement(f, q), ledger.main_file
                )
                lines = [
                    "# Income",
                    *_compact_tree(data["trees"]["income"], depth),
                    "# Expenses",
                    *_compact_tree(data["trees"]["expenses"], depth),
                    "# Net profit",
                    *_compact_tree(data["trees"]["netProfit"], 1),
                ]
            elif report == "balance_sheet":
                data = await store.run(
                    ledger.id, lambda f: engine.balance_sheet(f, q), ledger.main_file
                )
                lines = [
                    "# Assets",
                    *_compact_tree(data["trees"]["assets"], depth),
                    "# Liabilities",
                    *_compact_tree(data["trees"]["liabilities"], depth),
                    "# Equity",
                    *_compact_tree(data["trees"]["equity"], depth),
                ]
            else:
                data = await store.run(
                    ledger.id, lambda f: engine.cash_flow(f, q), ledger.main_file
                )
                lines = [
                    f"{i['begin']}..{i['date']}: operating {i['operating']} investing {i['investing']} financing {i['financing']} net {i['netChange']} closing cash {i['closingCash']}"
                    for i in data["intervals"][-12:]
                ]
            return {
                "report": report,
                "dateRange": data.get("dateRange"),
                "summary": "\n".join(lines),
            }, False
        if name == "search_transactions":
            q = ReportQuery(time=args.get("time") or None, account=args.get("account") or None)
            limit = min(int(args.get("limit") or 20), 100)
            data = await store.run(
                ledger.id,
                lambda f: engine.journal(
                    f, q, types=["Transaction"], search=args["text"], limit=limit
                ),
                ledger.main_file,
            )
            rows = [
                {
                    "date": e["date"],
                    "flag": e.get("flag"),
                    "payee": e.get("payee"),
                    "narration": e.get("narration"),
                    "postings": [
                        f"{p['account']} {p['amount']}".strip() for p in e.get("postings", [])
                    ],
                    "entryHash": e["entryHash"],
                    "file": f"{e.get('filename')}:{e.get('lineno')}",
                }
                for e in data["entries"]
            ]
            return {"total": data["total"], "transactions": rows}, False
        if name == "list_ledger_files":
            repo_root = store.paths(ledger.id).repo
            files = []
            for path in sorted(repo_root.rglob("*")):
                if ".git" in path.parts:
                    continue
                rel = path.relative_to(repo_root).as_posix()
                files.append(f"{rel}/" if path.is_dir() else f"{rel} ({path.stat().st_size} bytes)")
            return {"files": files}, False
        if name == "read_ledger_file":
            text, _sha = store.read_file(ledger.id, args["path"])
            lines = text.splitlines()
            start = max(int(args.get("start_line") or 1), 1)
            end = min(int(args.get("end_line") or (start + MAX_FILE_LINES - 1)), len(lines))
            end = min(end, start + MAX_FILE_LINES - 1)
            numbered = "\n".join(
                f"{i:5d}| {line}" for i, line in enumerate(lines[start - 1 : end], start=start)
            )
            return {
                "path": args["path"],
                "totalLines": len(lines),
                "startLine": start,
                "endLine": end,
                "content": numbered,
            }, False
        if name == "check_ledger_edit":
            changes = _preview_ops(args["files"], store, ledger.id)
            before = await store.run(ledger.id, engine.errors, ledger.main_file)
            projection = await store.project(ledger.id, changes, ledger.main_file)
            before_msgs = {e["message"] for e in before}
            new_errors = [e.to_dict() for e in projection.errors if e.message not in before_msgs]
            return {
                "operationsHash": operations_hash(args["files"]),
                "diffs": projection.diffs,
                "errorsBefore": len(before),
                "errorsAfter": len(projection.errors),
                "newErrors": new_errors,
            }, False
        if name == "edit_ledger_files":
            if not access.can_write:
                return {
                    "error": "This conversation is read-only; the user does not have write access."
                }, True
            ops_hash = operations_hash(args["files"])
            if ops_hash not in ctx.approved_hashes:
                return {
                    "error": "approval_required",
                    "message": "Call request_approval with the identical description and files, wait for the user's approval, then call edit_ledger_files again.",
                    "operationsHash": ops_hash,
                }, True
            changes = _preview_ops(args["files"], store, ledger.id)
            before = await store.run(ledger.id, engine.errors, ledger.main_file)
            projection = await store.project(ledger.id, changes, ledger.main_file)
            before_msgs = {e["message"] for e in before}
            new_errors = [e.to_dict() for e in projection.errors if e.message not in before_msgs]
            async with store.write_lock(ledger.id):
                for rel, content in changes.items():
                    if content is None:
                        store.delete_file(ledger.id, rel)
                    else:
                        store.write_file(ledger.id, rel, content)
                sha = await store.commit(
                    ledger.id, args["description"][:200], author_for(access.auth.user)
                )
            ctx.approved_hashes.discard(ops_hash)
            log.info("assistant committed %s to ledger %s", sha, ledger.id)
            return {
                "committed": True,
                "commit": sha,
                "files": list(changes),
                "newErrors": new_errors,
                "errorsAfter": len(projection.errors),
            }, False
        return {"error": f"Unknown tool {name}"}, True
    except AppError as exc:
        log.info("tool %s failed: %s", name, exc.message)
        return {"error": exc.message, "details": exc.details}, True
    except Exception as exc:  # the tool result must reach the model, so log and report
        log.error("tool %s crashed: %s", name, exc, exc_info=exc)
        return {"error": f"{exc.__class__.__name__}: {exc}"}, True


def approved_hashes_from_messages(messages: list[dict[str, Any]]) -> set[str]:
    """Collect operation hashes the user approved via request_approval tool results."""
    calls: dict[str, dict[str, Any]] = {}
    approved: set[str] = set()
    for message in messages:
        if message.get("role") == "assistant":
            for part in message.get("content") or []:
                if part.get("type") == "tool-call" and part.get("toolName") == APPROVAL_TOOL:
                    calls[part["toolCallId"]] = (
                        part.get("input")
                        if isinstance(part.get("input"), dict)
                        else (part.get("args") or {})
                    )
        elif message.get("role") == "tool":
            for part in message.get("content") or []:
                if part.get("type") != "tool-result" or part["toolCallId"] not in calls:
                    continue
                value = (part.get("output") or {}).get("value", part.get("result"))
                if isinstance(value, dict) and value.get("approved") is True:
                    files = calls[part["toolCallId"]].get("files")
                    if isinstance(files, list):
                        approved.add(operations_hash(files))
    return approved
