import type { Balance, DateBalance, DateRange, IntervalTotal } from "@/lib/api/types";
import { formatDate, precisionFor } from "@/lib/format";

/** Shared table cell classes so every report table has the same rhythm. */
export const TH = "px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground";
export const TH_NUM = "px-3 py-2 text-right text-xs font-medium whitespace-nowrap text-muted-foreground";
export const TD = "px-3 py-1.5 align-top";
export const TD_NUM = "px-3 py-1.5 text-right align-top";

function flipBalance(balance: Balance): Balance {
  return Object.fromEntries(Object.entries(balance).map(([unit, value]) => [unit, -value]));
}

/** Flip every sign of an interval total (balance, per-account balances, budgets). */
export function flipInterval(item: IntervalTotal): IntervalTotal {
  return {
    ...item,
    balance: flipBalance(item.balance),
    accountBalances: Object.fromEntries(Object.entries(item.accountBalances).map(([account, bal]) => [account, flipBalance(bal)])),
    budgets: flipBalance(item.budgets ?? {}),
  };
}

export function flipIf(items: IntervalTotal[], flip: boolean): IntervalTotal[] {
  return flip ? items.map(flipInterval) : items;
}

export function flipBalanceIf(balance: Balance, flip: boolean): Balance {
  return flip ? flipBalance(balance) : balance;
}

/** Human label for the interval starting on `begin`. */
export function periodLabel(begin: string, interval: string): string {
  switch (interval) {
    case "year":
      return begin.slice(0, 4);
    case "quarter":
      return `Q${Math.floor((Number(begin.slice(5, 7)) - 1) / 3) + 1} ${begin.slice(0, 4)}`;
    case "month":
      return formatDate(begin, { year: "numeric", month: "short" });
    default:
      return formatDate(begin);
  }
}

export function rangeLabel(range: DateRange | null): string {
  return range ? `${formatDate(range.begin)} – ${formatDate(range.endInclusive)}` : "All time";
}

export function isZero(balance: Balance | null | undefined): boolean {
  return Object.values(balance ?? {}).every((v) => v === 0);
}

/**
 * Step-align several balance series onto the union of their dates. Balances persist until the
 * next change, so each series carries its last known value forward (before its first point it
 * is empty, i.e. zero). Needed because the API emits one date per entry per account tree, so
 * series rarely share dates and Recharts would otherwise draw disconnected points.
 */
export function alignSeries(series: DateBalance[][]): DateBalance[][] {
  const dates = Array.from(new Set(series.flatMap((s) => s.map((p) => p.date)))).sort();
  return series.map((points) => {
    const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
    let cursor = 0;
    let current: Balance = {};
    return dates.map((date) => {
      while (cursor < sorted.length && sorted[cursor]!.date <= date) {
        current = sorted[cursor]!.balance;
        cursor += 1;
      }
      return { date, balance: current };
    });
  });
}

/** Drop units whose amount is below half of the smallest displayed digit (float noise). */
export function dropRounding(balance: Balance, precisions: Record<string, number>): Balance {
  return Object.fromEntries(Object.entries(balance).filter(([unit, value]) => Math.abs(value) >= 0.5 * 10 ** -precisionFor(unit, precisions)));
}
