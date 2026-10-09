"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import type { IntervalTotal } from "@/lib/api/types";
import { formatDate, precisionFor, primaryUnit, shortAccountLabels } from "@/lib/format";
import { axisTick, CHART_AXIS, CHART_GRID, CHART_TEXT, ChartEmpty, ChartLegend, ChartTooltipCard, dateTick, seriesColor, UnitScopeNote } from "./chart-primitives";

type Mode = "single" | "stacked";

/**
 * Totals per interval: a single series (e.g. net profit, signed) or stacked by account
 * (top N accounts by magnitude, rest folded into "Other").
 */
export function IntervalBarChart({
  data,
  unit,
  precisions,
  mode = "single",
  maxSeries = 7,
  height = 260,
  interval = "month",
  label = "Total",
  color,
  signed = true,
  className,
  onBarClick,
}: {
  data: IntervalTotal[];
  unit?: string;
  precisions?: Record<string, number>;
  mode?: Mode;
  maxSeries?: number;
  height?: number;
  interval?: string;
  label?: string;
  color?: string;
  /** Colour bars by sign (positive/negative) in single mode. */
  signed?: boolean;
  className?: string;
  onBarClick?: (date: string) => void;
}) {
  const chartUnit = useMemo(() => primaryUnit(data.map((d) => d.balance), unit), [data, unit]);
  const omitted = useMemo(() => {
    const units = new Set<string>();
    for (const d of data) for (const u of Object.keys(d.balance)) if (u !== chartUnit) units.add(u);
    return Array.from(units).sort();
  }, [data, chartUnit]);

  const { rows, seriesKeys } = useMemo(() => {
    if (!chartUnit) return { rows: [], seriesKeys: [] as string[] };
    if (mode === "single") {
      return {
        rows: data.map((d) => ({ date: d.date, total: d.balance[chartUnit] ?? 0, budget: d.budgets?.[chartUnit] })),
        seriesKeys: ["total"],
      };
    }
    const magnitude = new Map<string, number>();
    for (const d of data) {
      for (const [account, bal] of Object.entries(d.accountBalances)) {
        magnitude.set(account, (magnitude.get(account) ?? 0) + Math.abs(bal[chartUnit] ?? 0));
      }
    }
    const top = Array.from(magnitude.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxSeries)
      .map(([a]) => a);
    const hasOther = magnitude.size > top.length;
    const keys = hasOther ? [...top, "Other"] : top;
    const rows = data.map((d) => {
      const row: Record<string, number | string> = { date: d.date };
      let other = 0;
      for (const [account, bal] of Object.entries(d.accountBalances)) {
        const value = bal[chartUnit] ?? 0;
        if (top.includes(account)) row[account] = value;
        else other += value;
      }
      if (hasOther) row.Other = other;
      return row;
    });
    return { rows, seriesKeys: keys };
  }, [data, chartUnit, mode, maxSeries]);

  const labels = useMemo<Record<string, string>>(() => ({ ...shortAccountLabels(seriesKeys.filter((k) => k !== "Other" && k !== "total")), Other: "Other", total: label }), [seriesKeys, label]);

  if (!chartUnit || rows.length === 0) return <ChartEmpty />;
  const digits = precisionFor(chartUnit, precisions);

  const renderTooltip = ({ active, payload, label: date }: TooltipContentProps<ValueType, NameType>) => {
    if (!active || !payload?.length) return null;
    const items = payload.filter((p) => p.dataKey !== "budget" && Number(p.value) !== 0);
    const total = items.reduce((sum, p) => sum + Number(p.value ?? 0), 0);
    const budget = payload.find((p) => p.dataKey === "budget")?.value;
    return (
      <ChartTooltipCard
        title={formatDate(String(date), interval === "year" ? { year: "numeric" } : { year: "numeric", month: "short" })}
        rows={items.map((p) => ({ label: labels[String(p.dataKey)] ?? String(p.dataKey), value: Number(p.value ?? 0), color: String(p.color ?? p.fill), currency: chartUnit, digits }))}
        total={mode === "stacked" ? { label: "Total", value: total, currency: chartUnit, digits } : null}
        footer={budget !== undefined && budget !== null ? `Budget ${Number(budget).toFixed(digits)} ${chartUnit}` : undefined}
      />
    );
  };

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%" stackOffset="sign">
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={(v) => dateTick(String(v), interval)} tick={{ fill: CHART_TEXT, fontSize: 11 }} axisLine={{ stroke: CHART_AXIS }} tickLine={false} minTickGap={24} />
          <YAxis tickFormatter={axisTick} tick={{ fill: CHART_TEXT, fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
          <Tooltip content={renderTooltip} cursor={{ fill: "color-mix(in oklch, var(--foreground) 5%, transparent)" }} />
          {seriesKeys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              stackId={mode === "stacked" ? "stack" : undefined}
              fill={color ?? seriesColor(i)}
              radius={mode === "stacked" ? 0 : [4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive
              animationDuration={500}
              onClick={(entry) => onBarClick?.(String((entry as { date?: string }).date ?? ""))}
              className={onBarClick ? "cursor-pointer" : undefined}
            >
              {mode === "single" && signed && rows.map((row, idx) => <Cell key={idx} fill={Number(row.total) < 0 ? "var(--negative)" : (color ?? "var(--chart-3)")} />)}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      {mode === "stacked" && <ChartLegend className="mt-2" items={seriesKeys.map((k, i) => ({ label: labels[k] ?? k, color: seriesColor(i) }))} />}
      <UnitScopeNote unit={chartUnit} omitted={omitted} />
    </div>
  );
}
