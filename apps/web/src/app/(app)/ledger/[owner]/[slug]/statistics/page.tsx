"use client";

import { CheckIcon, ChevronDownIcon, CopyIcon } from "lucide-react";
import Link from "next/link";
import { BalanceAmounts } from "@/components/app/amount";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { accountHref, useLedgerContext } from "@/components/ledger/ledger-context";
import { BarList } from "@/components/reports/bar-list";
import { TD, TD_NUM, TH, TH_NUM } from "@/components/reports/helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useStatistics } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { dot: string; label: string }> = {
  green: { dot: "bg-positive", label: "Up to date" },
  yellow: { dot: "bg-warning", label: "Entries after the last balance check" },
  red: { dot: "bg-negative", label: "Last balance check failed" },
};

function StatusDot({ status }: { status: string | null }) {
  const info = status ? STATUS[status] : undefined;
  return (
    <span className="inline-flex items-center" title={info?.label ?? "No balance check"}>
      <span className={cn("size-2 rounded-full", info ? info.dot : "border border-muted-foreground/40")} aria-hidden />
      <span className="sr-only">{info?.label ?? "No balance check"}</span>
    </span>
  );
}

function BalanceDirectives({ text }: { text: string }) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  return (
    <Collapsible asChild>
      <Card className="animate-rise [animation-delay:240ms]">
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            <CollapsibleTrigger className="group flex items-center gap-1.5 text-sm font-medium">
              <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
              Balance directives for today
            </CollapsibleTrigger>
            <Button variant="outline" size="xs" onClick={() => copyToClipboard(text)}>
              {isCopied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
              {isCopied ? "Copied" : "Copy"}
            </Button>
          </div>
          <CollapsibleContent>
            <p className="mt-2 text-xs text-muted-foreground">Paste these into your ledger to assert every account&apos;s current balance.</p>
            <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-surface p-3 font-mono text-xs leading-5">{text}</pre>
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  );
}

export default function StatisticsPage() {
  const { owner, slug, params, conversion, precisions, base, queryString } = useLedgerContext();
  const query = useStatistics(owner, slug, { ...params, conversion });

  if (query.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Reports" title="Statistics" />
        <div className="grid gap-4 lg:grid-cols-2">
          <CardSkeleton rows={8} />
          <CardSkeleton rows={8} />
        </div>
        <CardSkeleton rows={6} />
      </div>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const data = query.data;
  const header = <PageHeader eyebrow="Reports" title="Statistics" description="What the ledger contains, which accounts are busiest, and which are due a balance check." />;

  if (data.entriesByType.every((row) => row.count === 0)) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          title="No entries in this scope"
          description="Import a statement or add entries to see statistics, or widen the time range."
          action={
            <Button asChild variant="outline">
              <Link href={`${base}/import`}>Import a statement</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const byType = [...data.entriesByType].sort((a, b) => b.count - a.count);
  const topAccounts = data.postingsPerAccount.slice(0, 25);

  return (
    <div className="space-y-6">
      {header}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="animate-rise [animation-delay:80ms]">
          <CardContent>
            <h2 className="mb-3 text-sm font-medium">Entries by type</h2>
            <BarList items={byType.map((row) => ({ key: row.type, label: row.type, value: row.count }))} />
          </CardContent>
        </Card>
        <Card className="animate-rise [animation-delay:120ms]">
          <CardContent>
            <h2 className="mb-3 text-sm font-medium">
              Postings per account <span className="font-normal text-muted-foreground">· top {topAccounts.length}</span>
            </h2>
            {topAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No postings in this scope.</p>
            ) : (
              <BarList items={topAccounts.map((row) => ({ key: row.account, label: row.account, value: row.count, href: accountHref(base, row.account, queryString), mono: true }))} />
            )}
          </CardContent>
        </Card>
      </div>

      <section className="animate-rise overflow-hidden rounded-xl border bg-card [animation-delay:160ms]" aria-labelledby="last-entries">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
          <h3 id="last-entries" className="text-sm font-medium">
            Last entry per account
          </h3>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {Object.entries(STATUS).map(([key, info]) => (
              <li key={key} className="inline-flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", info.dot)} aria-hidden />
                {info.label}
              </li>
            ))}
            <li className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full border border-muted-foreground/40" aria-hidden />
              No balance check
            </li>
          </ul>
        </header>
        {data.accountLastEntries.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No accounts have entries in this scope.</p>
        ) : (
          <div className="max-h-[30rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]">
                <tr>
                  <th scope="col" className={cn(TH, "w-8")}>
                    <span className="sr-only">Status</span>
                  </th>
                  <th scope="col" className={TH}>
                    Account
                  </th>
                  <th scope="col" className={TH}>
                    Last entry
                  </th>
                  <th scope="col" className={TH_NUM}>
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.accountLastEntries.map((row) => (
                  <tr key={row.account} className="border-t hover:bg-muted/40">
                    <td className={cn(TD, "pt-2.5")}>
                      <StatusDot status={row.uptodateStatus} />
                    </td>
                    <th scope="row" className={cn(TD, "text-left font-normal")}>
                      <Link href={accountHref(base, row.account, queryString)} className="font-mono text-[13px] hover:underline">
                        {row.account}
                      </Link>
                    </th>
                    <td className={TD}>
                      {row.date && row.entryHash ? (
                        <Link href={`${base}/entry/${row.entryHash}`} className="tabular hover:underline">
                          {formatDate(row.date)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                    <td className={TD_NUM}>
                      <BalanceAmounts balance={row.balance} precisions={precisions} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.allBalanceDirectives.trim() && <BalanceDirectives text={data.allBalanceDirectives} />}
    </div>
  );
}
