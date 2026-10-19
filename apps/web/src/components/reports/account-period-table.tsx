"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { BalanceAmounts } from "@/components/app/amount";
import { accountHref, useLedgerContext } from "@/components/ledger/ledger-context";
import type { AccountReport, Balance } from "@/lib/api/types";
import { accountLeaf } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isZero, periodLabel, TD_NUM, TH, TH_NUM } from "./helpers";

const MAX_PERIODS = 12;

interface PeriodRow {
  key: string;
  label: string;
  /** Account whose budgets apply to this row, if any. */
  account?: string;
  emphasis?: boolean;
  indent?: boolean;
  /** Balance per displayed period. */
  cells: Balance[];
}

/**
 * Change in the account (and each direct sub-account) over the last twelve periods.
 * The API gives one tree per period; we flatten it one level and show budgets underneath.
 */
export function AccountPeriodTable({ report, interval, inverted }: { report: AccountReport; interval: string; inverted: boolean }) {
  const { base, queryString, precisions } = useLedgerContext();
  const scroller = useRef<HTMLDivElement>(null);

  const { periods, rows, firstIndex } = useMemo(() => {
    const all = report.intervalBalances;
    const firstIndex = Math.max(0, all.length - MAX_PERIODS);
    const periods = all.slice(firstIndex);
    const childAccounts = Array.from(new Set(periods.flatMap((p) => p.tree.children.map((c) => c.account)))).sort();
    const childCell = (account: string, i: number) => periods[i]!.tree.children.find((c) => c.account === account)?.balanceChildren ?? {};
    const rows: PeriodRow[] = [];

    if (childAccounts.length === 0) {
      rows.push({ key: report.account, label: report.account, account: report.account, cells: periods.map((p) => p.tree.balanceChildren) });
      return { periods, rows, firstIndex };
    }
    rows.push({ key: "total", label: "Total", account: report.account, emphasis: true, cells: periods.map((p) => p.tree.balanceChildren) });
    const ownCells = periods.map((p) => p.tree.balance);
    if (ownCells.some((b) => !isZero(b))) rows.push({ key: "own", label: "This account only", indent: true, cells: ownCells });
    for (const child of childAccounts) {
      const cells = periods.map((_, i) => childCell(child, i));
      if (cells.some((b) => !isZero(b)) || report.budgets[child]) rows.push({ key: child, label: child, account: child, indent: true, cells });
    }
    return { periods, rows, firstIndex };
  }, [report]);

  // Newest periods are on the right; start scrolled there.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [periods.length, report.account]);

  if (periods.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="period-balances">
      <header className="border-b px-4 py-2.5">
        <h3 id="period-balances" className="text-sm font-medium">
          Balances by period
        </h3>
        <p className="text-xs text-muted-foreground">Net change in each {interval}; the last {periods.length} shown.</p>
      </header>
      <div ref={scroller} className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr>
              <th scope="col" className={cn(TH, "sticky left-0 z-10 bg-card")}>
                Account
              </th>
              {periods.map((p) => (
                <th key={p.date} scope="col" className={TH_NUM}>
                  {periodLabel(p.begin, interval)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={cn("border-t hover:bg-muted/40", row.emphasis && "bg-surface/60 font-medium")}>
                <th scope="row" className={cn("sticky left-0 z-10 bg-card px-3 py-1.5 text-left align-top font-normal whitespace-nowrap", row.emphasis && "bg-surface font-medium", row.indent && "pl-5")}>
                  {row.account && row.account !== report.account ? (
                    <Link href={accountHref(base, row.account, queryString)} className="font-mono text-[13px] hover:underline" title={row.account}>
                      {accountLeaf(row.account)}
                    </Link>
                  ) : (
                    <span className={cn(!row.emphasis && !row.indent && "font-mono text-[13px]", row.indent && "text-muted-foreground")}>{row.label}</span>
                  )}
                </th>
                {row.cells.map((cell, i) => {
                  const budget = row.account ? report.budgets[row.account]?.[firstIndex + i]?.budgetChildren : undefined;
                  return (
                    <td key={periods[i]!.date} className={TD_NUM}>
                      <BalanceAmounts balance={cell} precisions={precisions} invert={inverted} />
                      {budget && !isZero(budget) && (
                        <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                          <span>of</span>
                          <BalanceAmounts balance={budget} precisions={precisions} invert={inverted} className="text-[11px] text-muted-foreground" />
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
