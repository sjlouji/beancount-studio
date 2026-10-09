"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import type { DateBalance } from "@/lib/api/types";
import { formatDate, precisionFor, primaryUnit } from "@/lib/format";
import { axisTick, CHART_AXIS, CHART_GRID, CHART_TEXT, ChartEmpty, ChartTooltipCard, seriesColor, UnitScopeNote } from "./chart-primitives";

/**
 * One or more balance-over-time series (net worth, account balance). Each series is a
 * `DateBalance[]`; we chart a single unit (the most used one) and say which were omitted.
 */
export function BalanceLineChart({
  series,
  unit,
  precisions,
  height = 260,
  interval,
  className,
}: {
  series: Array<{ label: string; data: DateBalance[]; color?: string }>;
  unit?: string;
  precisions?: Record<string, number>;
  height?: number;
  interval?: string;
  className?: string;
}) {
  const chartUnit = useMemo(() => primaryUnit(series.flatMap((s) => s.data.map((d) => d.balance)), unit), [series, unit]);
  const omitted = useMemo(() => {
    const units = new Set<string>();
    for (const s of series) for (const d of s.data) for (const u of Object.keys(d.balance)) if (u !== chartUnit) units.add(u);
    return Array.from(units).sort();
  }, [series, chartUnit]);

  const data = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    series.forEach((s, i) => {
      for (const point of s.data) {
        const row = byDate.get(point.date) ?? { date: point.date };
        row[`s${i}`] = point.balance[chartUnit ?? ""] ?? 0;
        byDate.set(point.date, row);
      }
    });
    return Array.from(byDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [series, chartUnit]);

  if (!chartUnit || data.length === 0) return <ChartEmpty />;
  const digits = precisionFor(chartUnit, precisions);

  const renderTooltip = ({ active, payload, label }: TooltipContentProps<ValueType, NameType>) => {
    if (!active || !payload?.length) return null;
    return (
      <ChartTooltipCard
        title={formatDate(String(label))}
        rows={payload.map((p) => ({
          label: series[Number(String(p.dataKey).slice(1))]?.label ?? String(p.dataKey),
          value: Number(p.value ?? 0),
          color: String(p.color),
          currency: chartUnit,
          digits,
        }))}
      />
    );
  };

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={i} id={`bl-fill-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color ?? seriesColor(i)} stopOpacity={0.18} />
                <stop offset="100%" stopColor={s.color ?? seriesColor(i)} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={(v) => (interval ? String(v).slice(0, interval === "year" ? 4 : 7) : String(v).slice(0, 7))} tick={{ fill: CHART_TEXT, fontSize: 11 }} axisLine={{ stroke: CHART_AXIS }} tickLine={false} minTickGap={32} />
          <YAxis tickFormatter={axisTick} tick={{ fill: CHART_TEXT, fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
          <Tooltip content={renderTooltip} cursor={{ stroke: CHART_AXIS, strokeWidth: 1 }} />
          {series.map((s, i) => (
            <Area
              key={i}
              type="monotone"
              dataKey={`s${i}`}
              name={s.label}
              stroke={s.color ?? seriesColor(i)}
              strokeWidth={2}
              fill={`url(#bl-fill-${i})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              isAnimationActive
              animationDuration={600}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <UnitScopeNote unit={chartUnit} omitted={omitted} />
    </div>
  );
}
