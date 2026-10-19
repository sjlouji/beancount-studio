"use client";

import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, DownloadIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/app/states";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { Button } from "@/components/ui/button";
import type { QueryCell, QueryResult, QueryTableResult } from "@/lib/api/types";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cellSortKey, cellText, isNumericCell, QueryCellView } from "./query-cells";

const PAGE = 200;

type SortState = { column: number; direction: "asc" | "desc" } | null;

function csvField(text: string): string {
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(result: QueryTableResult) {
  const lines = [result.columns.map((c) => csvField(c.name)).join(","), ...result.rows.map((row) => row.map((cell) => csvField(cellText(cell))).join(","))];
  const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "query-results.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/** Nulls always sort last; numbers compare numerically, everything else by locale text. */
function compareCells(a: QueryCell, b: QueryCell, direction: "asc" | "desc"): number {
  const left = cellSortKey(a);
  const right = cellSortKey(b);
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const order = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true });
  return direction === "asc" ? order : -order;
}

function ResultTable({ result }: { result: QueryTableResult }) {
  const { base, queryString, precisions } = useLedgerContext();
  const [sort, setSort] = useState<SortState>(null);
  const [limit, setLimit] = useState(PAGE);

  const numeric = useMemo(() => result.columns.map((_, i) => result.rows.some((r) => r[i] !== null) && result.rows.every((r) => r[i] === null || isNumericCell(r[i]!))), [result]);
  const rows = useMemo(() => {
    if (!sort) return result.rows;
    return [...result.rows].sort((a, b) => compareCells(a[sort.column] ?? null, b[sort.column] ?? null, sort.direction));
  }, [result.rows, sort]);

  const cycleSort = (column: number) =>
    setSort((prev) => {
      if (prev?.column !== column) return { column, direction: "asc" };
      return prev.direction === "asc" ? { column, direction: "desc" } : null;
    });

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <p className="text-sm text-muted-foreground">
          <span className="tabular font-medium text-foreground">{result.rowCount.toLocaleString()}</span> {result.rowCount === 1 ? "row" : "rows"}
          {result.truncated && <span className="ml-2 text-warning-foreground dark:text-warning">Showing the first {result.rows.length.toLocaleString()} rows only. Narrow the query with LIMIT or WHERE.</span>}
        </p>
        <Button variant="outline" size="sm" onClick={() => downloadCsv(result)} disabled={result.rows.length === 0}>
          <DownloadIcon data-icon="inline-start" /> Download CSV
        </Button>
      </header>
      {result.rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">The query ran but returned no rows.</p>
      ) : (
        <div className="max-h-[70dvh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]">
              <tr>
                {result.columns.map((column, i) => {
                  const active = sort?.column === i ? sort.direction : null;
                  return (
                    <th key={`${column.name}-${i}`} scope="col" aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"} className={cn("px-3 py-2 font-medium whitespace-nowrap", numeric[i] ? "text-right" : "text-left")}>
                      <button type="button" onClick={() => cycleSort(i)} className={cn("inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", !active && "text-muted-foreground")}>
                        <span className="font-mono text-xs">{column.name}</span>
                        {active === "asc" ? <ArrowUpIcon className="size-3" /> : active === "desc" ? <ArrowDownIcon className="size-3" /> : <ChevronsUpDownIcon className="size-3 opacity-50" />}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((row, r) => (
                <tr key={r} className="border-b last:border-0 hover:bg-muted/40">
                  {row.map((cell, c) => (
                    <td key={c} className={cn("px-3 py-1.5 align-top", numeric[c] && "text-right")}>
                      <QueryCellView cell={cell} precisions={precisions} base={base} queryString={queryString} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > limit && (
        <footer className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
          <span>
            Showing {limit.toLocaleString()} of {rows.length.toLocaleString()}
          </span>
          <Button variant="ghost" size="xs" onClick={() => setLimit((n) => n + PAGE * 5)}>
            Show more
          </Button>
        </footer>
      )}
    </section>
  );
}

export function QueryResultView({ result }: { result: QueryResult }) {
  if (result.type === "text") {
    return result.contents.trim() ? (
      <pre className="overflow-auto rounded-xl border bg-card p-4 font-mono text-xs leading-relaxed">{result.contents}</pre>
    ) : (
      <EmptyState title="Nothing to show" description="The query produced no output." />
    );
  }
  return <ResultTable result={result} />;
}
