"use client";

import Link from "next/link";
import { BalanceAmounts } from "@/components/app/amount";
import { accountHref, useLedgerContext } from "@/components/ledger/ledger-context";
import type { Balance, BudgetsReport } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { TD, TD_NUM, TH, TH_NUM } from "./helpers";

type BudgetRow = BudgetsReport["report"][number]["rows"][number];

function absBalance(balance: Balance): Balance {
  return Object.fromEntries(Object.entries(balance).map(([unit, value]) => [unit, Math.abs(value)]));
}

/** Budget, actual (absolute), remaining and the share used, taking the busiest budgeted unit. */
function budgetFigures(row: BudgetRow) {
  const budget = absBalance(row.budget);
  const actual = absBalance(row.actual);
  const remaining: Balance = {};
  let usage = 0;
  for (const [unit, limit] of Object.entries(budget)) {
    if (limit === 0) continue;
    remaining[unit] = limit - (actual[unit] ?? 0);
    usage = Math.max(usage, (actual[unit] ?? 0) / limit);
  }
  return { budget, actual, remaining, usage };
}

/** Under 80% is on track, up to 100% is close, beyond that is over budget. */
function usageTone(usage: number): { bar: string; text: string; label: string } {
  if (usage > 1) return { bar: "bg-negative", text: "text-negative", label: "Over budget" };
  if (usage >= 0.8) return { bar: "bg-warning", text: "text-warning-foreground dark:text-warning", label: "Close to the limit" };
  return { bar: "bg-positive", text: "text-positive", label: "On track" };
}

function Meter({ usage }: { usage: number }) {
  const tone = usageTone(usage);
  const percent = Math.round(usage * 100);
  return (
    <div className="flex items-center gap-2" title={tone.label}>
      <div role="progressbar" aria-label={`${tone.label}, ${percent}% used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(percent, 100)} className="h-1.5 w-24 overflow-hidden rounded-full bg-muted sm:w-32">
        <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${Math.min(100, usage * 100)}%` }} />
      </div>
      <span className={cn("tabular w-10 text-right text-xs", tone.text)}>{percent}%</span>
    </div>
  );
}

export function BudgetTable({ rows }: { rows: BudgetRow[] }) {
  const { base, queryString, precisions } = useLedgerContext();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th scope="col" className={TH}>
              Account
            </th>
            <th scope="col" className={TH_NUM}>
              Budget
            </th>
            <th scope="col" className={TH_NUM}>
              Actual
            </th>
            <th scope="col" className={TH_NUM}>
              Remaining
            </th>
            <th scope="col" className={TH}>
              Used
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const figures = budgetFigures(row);
            return (
              <tr key={row.account} className="border-t hover:bg-muted/40">
                <th scope="row" className={cn(TD, "text-left font-normal")}>
                  <Link href={accountHref(base, row.account, queryString)} className="font-mono text-[13px] hover:underline">
                    {row.account}
                  </Link>
                </th>
                <td className={TD_NUM}>
                  <BalanceAmounts balance={figures.budget} precisions={precisions} />
                </td>
                <td className={TD_NUM}>
                  <BalanceAmounts balance={figures.actual} precisions={precisions} />
                </td>
                <td className={TD_NUM}>
                  <BalanceAmounts balance={figures.remaining} precisions={precisions} colored />
                </td>
                <td className={cn(TD, "pt-2.5")}>
                  <Meter usage={figures.usage} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
