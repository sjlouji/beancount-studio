"use client";

import Link from "next/link";
import { BalanceAmounts } from "@/components/app/amount";
import { accountHref, useLedgerContext } from "@/components/ledger/ledger-context";
import { Meter } from "@/components/ui/meter";
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

/** Thresholds shared by the meter's colour and its spoken status: under 80% on track, up to 100% close, beyond that over. */
const USAGE_LOW = 0.8;
const USAGE_HIGH = 1;

function usageLabel(usage: number): string {
  if (usage > USAGE_HIGH) return "Over budget";
  if (usage >= USAGE_LOW) return "Close to the limit";
  return "On track";
}

function UsageMeter({ account, usage }: { account: string; usage: number }) {
  const status = usageLabel(usage);
  return (
    <Meter
      value={usage}
      max={1}
      low={USAGE_LOW}
      high={USAGE_HIGH}
      optimum={0}
      showValue
      label={`Budget used for ${account}`}
      formatValue={(value) => `${Math.round(value * 100)}% used, ${status.toLowerCase()}`}
      title={status}
      className="w-36 sm:w-44"
    />
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
                  <UsageMeter account={row.account} usage={figures.usage} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
