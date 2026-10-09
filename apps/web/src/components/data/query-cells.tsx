"use client";

import Link from "next/link";
import { Amount, BalanceAmounts } from "@/components/app/amount";
import { accountHref } from "@/components/ledger/ledger-context";
import type { Balance, QueryCell } from "@/lib/api/types";
import { formatNumber } from "@/lib/format";

type AmountLike = { number: number; currency: string };

type PositionLike = { units: AmountLike; cost: Partial<AmountLike> | null };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACCOUNT = /^[A-Z][A-Za-z0-9-]*(?::[A-Z0-9][A-Za-z0-9-]*)+$/;

function isPlainObject(cell: QueryCell): cell is Record<string, unknown> {
  return typeof cell === "object" && cell !== null && !Array.isArray(cell);
}

function isAmount(value: unknown): value is AmountLike {
  const record = value as Record<string, unknown> | null;
  return typeof record === "object" && record !== null && typeof record.number === "number" && typeof record.currency === "string";
}

function isPosition(value: unknown): value is PositionLike {
  const record = value as Record<string, unknown> | null;
  return typeof record === "object" && record !== null && isAmount(record.units);
}

/** An Inventory serialises as `{ CURRENCY: number }`; `{}` is an empty inventory. */
function isInventory(cell: QueryCell): cell is Balance {
  return isPlainObject(cell) && Object.values(cell).every((v) => typeof v === "number");
}

function isCostWithCurrency(cost: PositionLike["cost"]): cost is AmountLike {
  return cost !== null && typeof cost.number === "number" && typeof cost.currency === "string";
}

/** Plain-number display: integers are never grouped (years, counts), decimals keep at least 2 places. */
function numberText(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const fraction = String(value).split(".")[1]?.length ?? 0;
  return formatNumber(value, Math.min(Math.max(fraction, 2), 8));
}

export function isNumericCell(cell: QueryCell): boolean {
  return typeof cell === "number" || isAmount(cell) || isPosition(cell) || (isPlainObject(cell) && isInventory(cell));
}

/** Value used when sorting a column: numbers numerically, inventories by their first unit. */
export function cellSortKey(cell: QueryCell): number | string | null {
  if (cell === null) return null;
  if (typeof cell === "number" || typeof cell === "string") return cell;
  if (typeof cell === "boolean") return cell ? 1 : 0;
  if (isAmount(cell)) return cell.number;
  if (isPosition(cell)) return cell.units.number;
  if (Array.isArray(cell)) return cell.join(", ");
  if (isInventory(cell)) {
    const first = Object.keys(cell).sort()[0];
    return first === undefined ? null : (cell[first] ?? null);
  }
  return JSON.stringify(cell);
}

/** Text form used for CSV export. */
export function cellText(cell: QueryCell): string {
  if (cell === null) return "";
  if (typeof cell === "string") return cell;
  if (typeof cell === "number" || typeof cell === "boolean") return String(cell);
  if (Array.isArray(cell)) return cell.join(", ");
  if (isAmount(cell)) return `${cell.number} ${cell.currency}`;
  if (isPosition(cell)) return `${cell.units.number} ${cell.units.currency}${isCostWithCurrency(cell.cost) ? ` {${cell.cost.number} ${cell.cost.currency}}` : ""}`;
  if (isInventory(cell)) return Object.entries(cell).map(([unit, n]) => `${n} ${unit}`).join(", ");
  return JSON.stringify(cell);
}

export function QueryCellView({ cell, precisions, base, queryString }: { cell: QueryCell; precisions: Record<string, number>; base: string; queryString: string }) {
  if (cell === null) return <span className="text-muted-foreground">–</span>;
  if (typeof cell === "boolean") return <span className="font-mono text-xs">{String(cell)}</span>;
  if (typeof cell === "number") return <span className="tabular">{numberText(cell)}</span>;
  if (typeof cell === "string") {
    if (DATE.test(cell)) return <span className="font-mono text-xs">{cell}</span>;
    if (ACCOUNT.test(cell)) {
      return (
        <Link href={accountHref(base, cell, queryString)} className="font-mono text-[13px] hover:underline">
          {cell}
        </Link>
      );
    }
    return <span>{cell}</span>;
  }
  if (Array.isArray(cell)) {
    return cell.length === 0 ? (
      <span className="text-muted-foreground">–</span>
    ) : (
      <span className="flex flex-wrap gap-1">
        {cell.map((item) => (
          <span key={String(item)} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
            {String(item)}
          </span>
        ))}
      </span>
    );
  }
  if (isAmount(cell)) return <Amount value={cell.number} currency={cell.currency} precisions={precisions} />;
  if (isPosition(cell)) {
    return (
      <span className="inline-flex flex-col items-end">
        <Amount value={cell.units.number} currency={cell.units.currency} precisions={precisions} />
        {isCostWithCurrency(cell.cost) && (
          <span className="tabular text-[11px] text-muted-foreground">
            {"{"}
            {numberText(cell.cost.number)} {cell.cost.currency}
            {"}"}
          </span>
        )}
      </span>
    );
  }
  if (isInventory(cell)) return <BalanceAmounts balance={cell} precisions={precisions} emptyLabel="–" />;
  return <code className="font-mono text-xs">{JSON.stringify(cell)}</code>;
}
