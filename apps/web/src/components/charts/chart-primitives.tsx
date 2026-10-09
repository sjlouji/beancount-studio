"use client";

import type { ReactNode } from "react";
import { formatCompact, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Fixed categorical slots (validated for CVD-safety in both themes). */
export const SERIES_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
] as const;

export const CHART_TEXT = "var(--muted-foreground)";
export const CHART_GRID = "color-mix(in oklch, var(--foreground) 9%, transparent)";
export const CHART_AXIS = "color-mix(in oklch, var(--foreground) 18%, transparent)";

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length]!;
}

export function axisTick(value: number): string {
  return formatCompact(value, 1);
}

export function dateTick(value: string, interval?: string): string {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  if (interval === "year") return y ?? value;
  if (interval === "day" || interval === "week") return `${m}/${d}`;
  const month = Number(m);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return month === 1 || value.endsWith("-01-01") ? `${names[month - 1]} ${y}` : (names[month - 1] ?? value);
}

export interface TooltipRow {
  label: string;
  value: number;
  color?: string;
  currency?: string;
  digits?: number;
}

/** Shared tooltip chrome: title, rows with swatches, total. */
export function ChartTooltipCard({ title, rows, total, footer }: { title: ReactNode; rows: TooltipRow[]; total?: TooltipRow | null; footer?: ReactNode }) {
  return (
    <div className="min-w-44 rounded-lg border bg-popover/95 px-3 py-2 text-xs shadow-float backdrop-blur">
      <div className="mb-1.5 font-medium text-foreground">{title}</div>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              {row.color && <span className="size-2 shrink-0 rounded-full" style={{ background: row.color }} />}
              <span className="truncate">{row.label}</span>
            </span>
            <span className="tabular text-foreground">
              {formatNumber(row.value, row.digits ?? 2)}
              {row.currency && <span className="ml-1 text-muted-foreground">{row.currency}</span>}
            </span>
          </div>
        ))}
      </div>
      {total && (
        <div className="mt-1.5 flex items-center justify-between gap-4 border-t pt-1.5 font-medium">
          <span>{total.label}</span>
          <span className="tabular">
            {formatNumber(total.value, total.digits ?? 2)}
            {total.currency && <span className="ml-1 text-muted-foreground">{total.currency}</span>}
          </span>
        </div>
      )}
      {footer && <div className="mt-1.5 text-muted-foreground">{footer}</div>}
    </div>
  );
}

export function ChartLegend({ items, className }: { items: Array<{ label: string; color: string }>; className?: string }) {
  if (items.length < 2) return null;
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function ChartEmpty({ message = "Nothing to chart for this scope." }: { message?: string }) {
  return <div className="flex h-full min-h-40 items-center justify-center text-sm text-muted-foreground">{message}</div>;
}

export function UnitScopeNote({ unit, omitted }: { unit: string | undefined; omitted: string[] }) {
  if (!unit || omitted.length === 0) return null;
  return (
    <p className="text-[11px] text-muted-foreground">
      Showing {unit} only; {omitted.join(", ")} {omitted.length === 1 ? "is" : "are"} not converted and not included.
    </p>
  );
}
