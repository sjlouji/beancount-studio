"use client";

import { useMemo } from "react";
import { BalanceLineChart } from "@/components/charts/balance-line-chart";
import type { CommoditiesReport, DateBalance } from "@/lib/api/types";
import { formatDate, formatNumber, precisionFor } from "@/lib/format";
import { cn } from "@/lib/utils";

type Pair = CommoditiesReport["pairs"][number];

/** One base/quote price history: latest price, change since the first price in scope, and a line chart. */
export function PriceCard({ pair, name, precisions, delay = 0 }: { pair: Pair; name?: string; precisions: Record<string, number>; delay?: number }) {
  const series = useMemo<DateBalance[]>(() => pair.prices.map((p) => ({ date: p.date, balance: { [pair.quote]: p.value } })), [pair]);
  const first = pair.prices[0]!;
  const last = pair.prices[pair.prices.length - 1]!;
  const change = last.value - first.value;
  const percent = first.value !== 0 ? (change / Math.abs(first.value)) * 100 : null;
  const digits = precisionFor(pair.quote, precisions);
  const tone = change > 0 ? "text-positive" : change < 0 ? "text-negative" : "text-muted-foreground";

  return (
    <article className="animate-rise rounded-xl border bg-card p-4 card-elevated" style={{ animationDelay: `${delay}ms` }}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">
            <span className="font-mono">{pair.base}</span> in <span className="font-mono">{pair.quote}</span>
          </h2>
          {name && <p className="truncate text-xs text-muted-foreground">{name}</p>}
        </div>
        <div className="text-right">
          <div className="tabular text-xl font-semibold tracking-tight">
            {formatNumber(last.value, digits)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">{pair.quote}</span>
          </div>
          <div className="text-xs text-muted-foreground">{formatDate(last.date)}</div>
        </div>
      </header>
      <div className={cn("tabular mt-2 text-xs", tone)}>
        {pair.prices.length > 1 ? (
          <>
            {change > 0 ? "+" : ""}
            {formatNumber(change, digits)} {pair.quote}
            {percent !== null && ` (${change > 0 ? "+" : ""}${percent.toFixed(1)}%)`}
            <span className="text-muted-foreground"> since {formatDate(first.date)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Only one price recorded</span>
        )}
      </div>
      <BalanceLineChart className="mt-2" series={[{ label: `${pair.base} price`, data: series, color: "var(--chart-1)" }]} unit={pair.quote} precisions={precisions} height={150} />
    </article>
  );
}
