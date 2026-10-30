"""Read-only ledger reports and data pages. All routes accept the shared filter params."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.core.deps import LedgerReadDep, SettingsDep
from app.ledgers import engine
from app.ledgers.engine import ReportQuery
from app.ledgers.store import get_store

router = APIRouter(prefix="/workspaces/{workspace}/ledgers/{slug}", tags=["reports"])


def report_query(
    account: str | None = Query(default=None),
    filter: str | None = Query(default=None),  # noqa: A002
    time: str | None = Query(default=None),
    conversion: str = Query(default="at_cost"),
    interval: str = Query(default="month"),
) -> ReportQuery:
    return ReportQuery(
        account=account, filter=filter, time=time, conversion=conversion, interval=interval
    )


QueryDep = Annotated[ReportQuery, Depends(report_query)]


async def _run(access: LedgerReadDep, fn, *args: Any, **kwargs: Any):
    return await get_store().run(access.ledger, lambda fava: fn(fava, *args, **kwargs))


@router.get("/meta")
async def meta(access: LedgerReadDep):
    return await _run(access, engine.ledger_meta)


@router.get("/attributes")
async def attributes(access: LedgerReadDep):
    return await _run(access, engine.attributes)


@router.get("/errors")
async def errors(access: LedgerReadDep):
    return await _run(access, engine.errors)


@router.get("/options")
async def options(access: LedgerReadDep):
    return await _run(access, engine.options_report)


@router.get("/reports/overview")
async def overview(access: LedgerReadDep, q: QueryDep):
    return await _run(access, engine.overview, q)


@router.get("/reports/income-statement")
async def income_statement(access: LedgerReadDep, q: QueryDep):
    return await _run(access, engine.income_statement, q)


@router.get("/reports/balance-sheet")
async def balance_sheet(access: LedgerReadDep, q: QueryDep):
    return await _run(access, engine.balance_sheet, q)


@router.get("/reports/trial-balance")
async def trial_balance(access: LedgerReadDep, q: QueryDep):
    return await _run(access, engine.trial_balance, q)


@router.get("/reports/cash-flow")
async def cash_flow(access: LedgerReadDep, q: QueryDep):
    return await _run(access, engine.cash_flow, q)


@router.get("/reports/account/{account_name:path}")
async def account_report(account_name: str, access: LedgerReadDep, q: QueryDep):
    return await _run(access, engine.account_report, q, account_name)


@router.get("/reports/interval-totals")
async def interval_totals(
    access: LedgerReadDep,
    q: QueryDep,
    accounts: list[str] = Query(default=[]),
    invert: bool = Query(default=False),
):
    return await _run(access, engine.interval_totals, q, accounts or ["Expenses"], invert=invert)


@router.get("/accounts")
async def accounts(access: LedgerReadDep, q: QueryDep):
    return await _run(access, engine.accounts_detail, q)


@router.get("/commodities")
async def commodities(access: LedgerReadDep, q: QueryDep):
    return await _run(access, engine.commodities, q)


@router.get("/documents")
async def documents(access: LedgerReadDep, q: QueryDep):
    return await _run(access, engine.documents, q)


@router.get("/events")
async def events(access: LedgerReadDep, q: QueryDep):
    return await _run(access, engine.events, q)


@router.get("/statistics")
async def statistics(access: LedgerReadDep, q: QueryDep):
    return await _run(access, engine.statistics, q)


@router.get("/budgets")
async def budgets(access: LedgerReadDep, q: QueryDep):
    return await _run(access, engine.budgets, q)


@router.get("/holdings")
async def holdings(
    access: LedgerReadDep, q: QueryDep, group_by: str = Query(default="lot", alias="groupBy")
):
    return await _run(access, engine.holdings, q, group_by=group_by)


@router.get("/query")
async def query(
    access: LedgerReadDep,
    q: QueryDep,
    settings: SettingsDep,
    query_string: str = Query(alias="q", min_length=1, max_length=5000),
):
    return await _run(access, engine.run_query, q, query_string, max_rows=settings.bql_max_rows)
