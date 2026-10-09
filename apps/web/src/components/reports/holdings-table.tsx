"use client";

import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Amount } from "@/components/app/amount";
import { accountHref, useLedgerContext } from "@/components/ledger/ledger-context";
import type { QueryCell, QueryColumn, QueryTableResult } from "@/lib/api/types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TD, TD_NUM, TH, TH_NUM } from "./helpers";

const LABELS: Record<string, string> = {
  account: "Account",
  currency: "Currency",
  units: "Units",
  cost: "Cost",
  price: "Price",
  book_value: "Book value",
  market_value: "Market value",
  unrealized_profit_pct: "Unrealized P/L",
  acquisition_date: "Acquired",
};

function columnLabel(name: string): string {
  return LABELS[name] ?? name.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

type Inventory = Record<string, number>;

function isNumber(value: QueryCell): value is number {
  return typeof value === "number";
}

/** An inventory cell is `{unit: number}`; positions come as `{units: {number, currency}, cost}`. */
function inventoryOf(value: QueryCell): Inventory | null {
  if (value === null || typeof value !== "object") return null;
  const units = (value as { units?: { number?: unknown; currency?: unknown } }).units;
  if (units && typeof units.number === "number" && typeof units.currency === "string") return { [units.currency]: units.number };
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
}

function isInventoryColumn(column: QueryColumn): boolean {
  return column.dtype === "Inventory" || column.dtype === "Position";
}

function isNumericColumn(column: QueryColumn): boolean {
  return isInventoryColumn(column) || column.dtype === "Decimal" || column.dtype === "int" || column.dtype === "Amount";
}

/** Scalar used to order a cell: numbers as is, inventories by their largest magnitude, text as text. */
function sortKey(value: QueryCell): number | string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const inventory = inventoryOf(value);
  if (!inventory) return null;
  const amounts = Object.values(inventory).map(Math.abs);
  return amounts.length === 0 ? null : Math.max(...amounts);
}

/** Order two non-empty sort keys; numbers numerically, everything else as natural-order text. */
function compareKeys(left: number | string, right: number | string): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}

/** A lot with no units left in any inventory column (fully sold). */
function isClosedRow(row: QueryCell[], inventoryIndexes: number[]): boolean {
  return inventoryIndexes.length > 0 && inventoryIndexes.every((i) => Object.values(inventoryOf(row[i] ?? null) ?? {}).every((n) => n === 0));
}

function Cell({ column, value }: { column: QueryColumn; value: QueryCell }) {
  const { base, queryString, precisions } = useLedgerContext();
  if (value === null || value === undefined) return <span className="text-muted-foreground">–</span>;
  if (isInventoryColumn(column)) {
    const entries = Object.entries(inventoryOf(value) ?? {}).filter(([, n]) => n !== 0);
    if (entries.length === 0) return <span className="text-muted-foreground">–</span>;
    return (
      <span className="flex flex-col items-end gap-0.5">
        {entries.map(([unit, number]) => (
          <Amount key={unit} value={number} currency={unit} precisions={precisions} />
        ))}
      </span>
    );
  }
  if (column.name === "unrealized_profit_pct" && isNumber(value)) {
    const tone = value > 0 ? "text-positive" : value < 0 ? "text-negative" : "text-muted-foreground";
    return (
      <span className={cn("tabular whitespace-nowrap", tone)}>
        {value > 0 ? "+" : ""}
        {formatNumber(value, 2)}%
      </span>
    );
  }
  if (isNumber(value)) return <span className="tabular whitespace-nowrap">{formatNumber(value, column.dtype === "int" ? 0 : 2)}</span>;
  if (column.name === "account" && typeof value === "string") {
    return (
      <Link href={accountHref(base, value, queryString)} className="font-mono text-[13px] hover:underline">
        {value}
      </Link>
    );
  }
  if (typeof value === "object") return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
  return <span className={column.dtype === "date" ? "tabular whitespace-nowrap" : undefined}>{String(value)}</span>;
}

/** The BQL result table: click a header to sort, numbers sort numerically. */
export function HoldingsTable({ result }: { result: QueryTableResult }) {
  const [sort, setSort] = useState<{ index: number; dir: "asc" | "desc" } | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const inventoryIndexes = useMemo(() => result.columns.flatMap((c, i) => (isInventoryColumn(c) ? [i] : [])), [result.columns]);
  const closedCount = useMemo(() => result.rows.filter((row) => isClosedRow(row, inventoryIndexes)).length, [result.rows, inventoryIndexes]);

  const rows = useMemo(() => {
    const visible = showClosed ? result.rows : result.rows.filter((row) => !isClosedRow(row, inventoryIndexes));
    if (!sort) return visible;
    const factor = sort.dir === "asc" ? 1 : -1;
    // Empty cells sink to the bottom in both directions.
    return [...visible].sort((a, b) => {
      const left = sortKey(a[sort.index] ?? null);
      const right = sortKey(b[sort.index] ?? null);
      if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
      return compareKeys(left, right) * factor;
    });
  }, [result.rows, sort, showClosed, inventoryIndexes]);

  const toggleSort = (index: number) => setSort((prev) => (prev?.index === index ? { index, dir: prev.dir === "asc" ? "desc" : "asc" } : { index, dir: "asc" }));

  return (
    <div>
      <div className="max-h-[36rem] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]">
            <tr>
              {result.columns.map((column, index) => {
                const active = sort?.index === index ? sort.dir : null;
                const numeric = isNumericColumn(column);
                const Icon = active === "asc" ? ArrowUpIcon : active === "desc" ? ArrowDownIcon : ChevronsUpDownIcon;
                return (
                  <th key={column.name} scope="col" className={numeric ? TH_NUM : TH} aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}>
                    <button type="button" onClick={() => toggleSort(index)} className={cn("inline-flex items-center gap-1 hover:text-foreground", numeric && "flex-row-reverse", active && "text-foreground")}>
                      {columnLabel(column.name)}
                      <Icon className={cn("size-3", !active && "opacity-40")} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t hover:bg-muted/40">
                {result.columns.map((column, index) => (
                  <td key={column.name} className={isNumericColumn(column) ? TD_NUM : TD}>
                    <Cell column={column} value={row[index] ?? null} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
        <span>
          {rows.length.toLocaleString()} {rows.length === 1 ? "row" : "rows"}
          {result.truncated && ` · truncated, showing the first ${result.rows.length.toLocaleString()} of ${result.rowCount.toLocaleString()}`}
        </span>
        {closedCount > 0 && (
          <button type="button" onClick={() => setShowClosed((v) => !v)} className="hover:text-foreground hover:underline">
            {showClosed ? "Hide" : "Show"} {closedCount.toLocaleString()} fully sold {closedCount === 1 ? "lot" : "lots"}
          </button>
        )}
      </div>
    </div>
  );
}
