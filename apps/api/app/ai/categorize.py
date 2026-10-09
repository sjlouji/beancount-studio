"""Category suggestions for imported rows: payee history first, then the model for the rest."""

from __future__ import annotations

import json
import re
from typing import Any

from app.ai.providers import ProviderError, get_provider
from app.config import Settings
from app.logging_setup import get_logger

log = get_logger(__name__)

_SUGGESTION_SCHEMA = {
    "type": "object",
    "properties": {
        "suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "account": {"type": "string"},
                    "confidence": {"type": "number"},
                    "reasoning": {"type": "string"},
                },
                "required": ["id", "account", "confidence", "reasoning"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["suggestions"],
    "additionalProperties": False,
}


def _normalise(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", text.lower()).strip()


def _history_match(payee: str, history: dict[str, dict[str, int]]) -> tuple[str, float] | None:
    key = _normalise(payee)
    if not key:
        return None
    candidates = history.get(key)
    if not candidates:
        tokens = set(key.split())
        best: tuple[str, int] | None = None
        for hist_payee, accounts in history.items():
            overlap = len(tokens & set(hist_payee.split()))
            if overlap and (
                hist_payee.startswith(key)
                or key.startswith(hist_payee)
                or overlap >= max(1, len(tokens) - 1)
            ):
                total = sum(accounts.values())
                if best is None or total > best[1]:
                    best = (hist_payee, total)
        if best is None:
            return None
        candidates = history[best[0]]
    account, count = max(candidates.items(), key=lambda kv: kv[1])
    total = sum(candidates.values())
    return account, round(count / total, 2)


async def suggest_categories(
    settings: Settings,
    *,
    rows: list[dict[str, Any]],
    history: dict[str, dict[str, int]],
    accounts: list[str],
    source_account: str | None,
    use_ai: bool,
) -> list[dict[str, Any]]:
    suggestions: dict[int, dict[str, Any]] = {}
    unresolved: list[dict[str, Any]] = []
    for row in rows:
        match = _history_match(row.get("payee") or row.get("description") or "", history)
        if match is not None:
            suggestions[row["id"]] = {
                "id": row["id"],
                "account": match[0],
                "confidence": match[1],
                "source": "history",
                "reasoning": "Previous transactions with this payee",
            }
        else:
            unresolved.append(row)

    if unresolved and use_ai:
        try:
            ai = await _ai_suggestions(settings, unresolved, accounts, source_account)
            for item in ai:
                if item["account"] in accounts:
                    suggestions[item["id"]] = {**item, "source": "ai"}
        except ProviderError as exc:
            log.error("AI categorisation failed (%s): %s", exc.kind, exc.message)
    return [suggestions[r["id"]] for r in rows if r["id"] in suggestions]


async def _ai_suggestions(
    settings: Settings,
    rows: list[dict[str, Any]],
    accounts: list[str],
    source_account: str | None,
) -> list[dict[str, Any]]:
    provider = get_provider(settings)
    candidate_accounts = [
        a for a in accounts if a.startswith(("Expenses", "Income", "Assets", "Liabilities"))
    ]
    compact_rows = [
        {
            "id": r["id"],
            "date": r.get("date"),
            "payee": r.get("payee"),
            "description": r.get("description"),
            "amount": r.get("amount"),
        }
        for r in rows[:400]
    ]
    prompt = (
        "Assign the most likely Beancount account to each bank transaction row. Choose ONLY from the "
        "account list. Positive amounts are money coming in to the source account; negative amounts "
        f"are money going out. Source account: {source_account or 'unknown'}.\n\nAccounts:\n"
        + "\n".join(candidate_accounts)
        + "\n\nRows (JSON):\n"
        + json.dumps(compact_rows, ensure_ascii=False)
    )
    data = await provider.generate_json(
        model=settings.resolved_ai_fast_model,
        system="You categorise bank transactions into double-entry accounts. Return only JSON matching the schema.",
        parts=[{"type": "text", "text": prompt}],
        schema=_SUGGESTION_SCHEMA,
    )
    out = []
    for s in data.get("suggestions", []):
        try:
            out.append(
                {
                    "id": int(s["id"]),
                    "account": str(s["account"]),
                    "confidence": float(s.get("confidence", 0.5)),
                    "reasoning": str(s.get("reasoning", "")),
                }
            )
        except (KeyError, TypeError, ValueError):
            continue
    return out
