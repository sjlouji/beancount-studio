"use client";

import { PencilIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Amount } from "@/components/app/amount";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { EntryContextSheet } from "@/components/ledger/entry-context-sheet";
import { accountHref, useLedgerContext } from "@/components/ledger/ledger-context";
import { NewEntryDialog } from "@/components/ledger/new-entry-dialog";
import { BudgetTable } from "@/components/reports/budget-table";
import { ChartTabsCard } from "@/components/reports/chart-tabs-card";
import { TD, TD_NUM, TH, TH_NUM } from "@/components/reports/helpers";
import { Button } from "@/components/ui/button";
import { useBudgets } from "@/lib/api/hooks";
import type { BudgetEntry } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

const EXAMPLE = '2026-01-01 custom "budget" Expenses:Food:Groceries "monthly" 400.00 USD';
const INTERVAL_LABEL = { month: "This month", quarter: "This quarter", year: "This year" } as const;

/** Budget periods run from `begin` up to, but excluding, `end`. */
function periodText(begin: string, end: string): string {
  const last = new Date(`${end}T00:00:00`);
  last.setDate(last.getDate() - 1);
  return `${formatDate(begin)} – ${formatDate(last)}`;
}

export default function BudgetPage() {
  const { owner, slug, params, conversion, precisions, canWrite, base, queryString } = useLedgerContext();
  const query = useBudgets(owner, slug, { ...params, conversion });
  const [adding, setAdding] = useState(false);
  const [openEntry, setOpenEntry] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const byAccount = new Map<string, BudgetEntry[]>();
    for (const entry of query.data?.entries ?? []) {
      const key = entry.account ?? "";
      byAccount.set(key, [...(byAccount.get(key) ?? []), entry]);
    }
    for (const list of byAccount.values()) list.sort((a, b) => b.date.localeCompare(a.date));
    return Array.from(byAccount.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [query.data]);

  const addButton = canWrite ? (
    <Button size="sm" onClick={() => setAdding(true)}>
      <PlusIcon data-icon="inline-start" /> Add budget
    </Button>
  ) : undefined;
  const header = <PageHeader eyebrow="Reports" title="Budget" description="Spending limits per account, compared with what actually happened." actions={addButton} />;
  const dialog = <NewEntryDialog open={adding} onOpenChange={setAdding} initialKind="Budget" />;

  if (query.isPending) {
    return (
      <div className="space-y-6">
        {header}
        <CardSkeleton rows={6} />
        <CardSkeleton rows={4} />
      </div>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data;

  if (data.entries.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          title="No budgets yet"
          description={
            <>
              Budgets are <span className="font-mono text-xs">custom &quot;budget&quot;</span> directives: an account, a period (daily, weekly, monthly, quarterly or yearly) and an amount. Each applies from its date until replaced by a later one.
            </>
          }
          action={
            <div className="flex flex-col items-center gap-3">
              <pre className="max-w-full overflow-x-auto rounded-md bg-surface px-3 py-2 text-left font-mono text-xs">{EXAMPLE}</pre>
              {addButton ?? <p className="text-xs text-muted-foreground">Ask a collaborator with write access, or add the line in the editor.</p>}
              <Button asChild variant="ghost" size="sm">
                <Link href={`${base}/files/edit`}>Open the editor</Link>
              </Button>
            </div>
          }
        />
        {dialog}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      <ChartTabsCard
        className="animate-rise [animation-delay:80ms]"
        title="Budget vs actual"
        defaultValue="month"
        tabs={data.report.map((period) => ({
          value: period.interval,
          label: period.interval[0]!.toUpperCase() + period.interval.slice(1),
          content: (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {INTERVAL_LABEL[period.interval]} · {periodText(period.begin, period.end)}
              </p>
              {period.rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No budget applies to this period.</p> : <BudgetTable rows={period.rows} />}
            </div>
          ),
        }))}
      />

      <section className="animate-rise overflow-hidden rounded-xl border bg-card [animation-delay:120ms]" aria-labelledby="budget-entries">
        <header className="border-b px-4 py-2.5">
          <h3 id="budget-entries" className="text-sm font-medium">
            Budget directives
          </h3>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  Period
                </th>
                <th scope="col" className={TH_NUM}>
                  Amount
                </th>
                <th scope="col" className={TH}>
                  Since
                </th>
                <th scope="col" className="w-12">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            {grouped.map(([account, entries]) => (
              <tbody key={account || "unparsed"} className="border-t">
                <tr className="bg-surface/60">
                  <th scope="rowgroup" colSpan={4} className="px-3 py-1.5 text-left font-normal">
                    {account ? (
                      <Link href={accountHref(base, account, queryString)} className="font-mono text-[13px] hover:underline">
                        {account}
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-negative">
                        <TriangleAlertIcon className="size-3.5" /> Unreadable budget directives
                      </span>
                    )}
                  </th>
                </tr>
                {entries.map((entry) => (
                  <tr key={entry.entryHash} className="border-t hover:bg-muted/40">
                    <td className={TD}>{entry.period ?? <span className="text-muted-foreground">–</span>}</td>
                    <td className={TD_NUM}>{entry.number !== null && entry.currency ? <Amount value={entry.number} currency={entry.currency} precisions={precisions} /> : <span className="text-muted-foreground">–</span>}</td>
                    <td className={TD}>
                      <time dateTime={entry.date} className="tabular">
                        {formatDate(entry.date)}
                      </time>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <Button variant="ghost" size="icon-xs" aria-label={`Open budget directive from ${entry.date}`} onClick={() => setOpenEntry(entry.entryHash)}>
                        <PencilIcon />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>
      {dialog}
      <EntryContextSheet entryHash={openEntry} onOpenChange={(open) => !open && setOpenEntry(null)} />
    </div>
  );
}
