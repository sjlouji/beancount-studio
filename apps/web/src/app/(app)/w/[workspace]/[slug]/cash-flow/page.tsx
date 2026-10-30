"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BalanceAmounts } from "@/components/app/amount";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { IntervalBarChart } from "@/components/charts/interval-bar-chart";
import { accountHref, useLedgerContext } from "@/components/ledger/ledger-context";
import { buildTable, type ExportReport } from "@/components/reports/export";
import { ExportMenu } from "@/components/reports/export-menu";
import { periodLabel, rangeLabel, TD, TD_NUM, TH, TH_NUM } from "@/components/reports/helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCashFlow } from "@/lib/api/hooks";
import type { IntervalTotal } from "@/lib/api/types";
import { primaryUnit } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROLE_TONE: Record<string, string> = {
  cash: "bg-chart-1/15 text-chart-1",
  operating: "bg-chart-3/15 text-chart-3",
  investing: "bg-chart-2/15 text-chart-2",
  financing: "bg-chart-5/15 text-chart-5",
  excluded: "bg-muted text-muted-foreground",
};

export default function CashFlowPage() {
  const { workspace, slug, params, conversion, precisions, base, queryString, ledger } = useLedgerContext();
  const query = useCashFlow(workspace, slug, { ...params, conversion });
  const interval = params.interval ?? "month";
  const data = query.data;

  const chartData = useMemo<IntervalTotal[]>(
    () =>
      (data?.intervals ?? []).map((row) => ({
        date: row.date,
        balance: row.netChange,
        accountBalances: { Operating: row.operating, Investing: row.investing, Financing: row.financing },
        budgets: {},
      })),
    [data],
  );
  const unit = useMemo(() => primaryUnit(chartData.map((d) => d.balance), conversion), [chartData, conversion]);

  if (query.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Reports" title="Cash flow" />
        <CardSkeleton rows={8} />
        <CardSkeleton rows={6} />
      </div>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!data) return null;

  const buildReport = (): ExportReport => ({
    title: `Cash flow · ${ledger.title}`,
    subtitle: `${rangeLabel(data.dateRange)} · by ${interval} · converted to ${conversion}`,
    tables: [
      buildTable({
        title: "Cash flow by period",
        leadHeaders: ["Period", "From", "To"],
        valueHeaders: ["Opening cash", "Operating", "Investing", "Financing", "Net change", "Closing cash"],
        precisions,
        rows: data.intervals.map((row) => ({
          lead: [periodLabel(row.begin, interval), row.begin, row.date],
          values: [row.openingCash, row.operating, row.investing, row.financing, row.netChange, row.closingCash],
        })),
      }),
    ],
  });

  const header = (
    <PageHeader
      eyebrow="Reports"
      title="Cash flow"
      description={`Where cash came from and where it went, by ${interval} · ${rangeLabel(data.dateRange)}`}
      actions={<ExportMenu fileName={`cash-flow-${slug}`} build={buildReport} printable={false} />}
    />
  );

  if (data.intervals.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          title="No cash movements in this period"
          description="Widen the time range, or check that your cash accounts (checking, savings, wallet…) have transactions."
          action={
            <Button asChild variant="outline">
              <Link href={`${base}/accounts${queryString}`}>Browse accounts</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      <Card className="animate-rise [animation-delay:80ms]">
        <CardContent>
          <h2 className="mb-2 text-sm font-medium">Operating, investing and financing</h2>
          <IntervalBarChart data={chartData} unit={unit} precisions={precisions} interval={interval} mode="stacked" height={280} />
        </CardContent>
      </Card>

      <section className="animate-rise overflow-hidden rounded-xl border bg-card [animation-delay:120ms]" aria-labelledby="cf-intervals">
        <header className="border-b px-4 py-2.5">
          <h3 id="cf-intervals" className="text-sm font-medium">
            By period
          </h3>
        </header>
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]">
              <tr>
                <th scope="col" className={TH}>
                  Period
                </th>
                {["Opening cash", "Operating", "Investing", "Financing", "Net change", "Closing cash"].map((label) => (
                  <th key={label} scope="col" className={TH_NUM}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.intervals.map((row) => (
                <tr key={row.date} className="border-t hover:bg-muted/40">
                  <th scope="row" className={cn(TD, "text-left font-normal whitespace-nowrap")}>
                    {periodLabel(row.begin, interval)}
                  </th>
                  <td className={TD_NUM}>
                    <BalanceAmounts balance={row.openingCash} precisions={precisions} />
                  </td>
                  <td className={TD_NUM}>
                    <BalanceAmounts balance={row.operating} precisions={precisions} colored />
                  </td>
                  <td className={TD_NUM}>
                    <BalanceAmounts balance={row.investing} precisions={precisions} colored />
                  </td>
                  <td className={TD_NUM}>
                    <BalanceAmounts balance={row.financing} precisions={precisions} colored />
                  </td>
                  <td className={cn(TD_NUM, "font-medium")}>
                    <BalanceAmounts balance={row.netChange} precisions={precisions} colored />
                  </td>
                  <td className={TD_NUM}>
                    <BalanceAmounts balance={row.closingCash} precisions={precisions} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <section className="animate-rise overflow-hidden rounded-xl border bg-card [animation-delay:160ms] lg:col-span-2" aria-labelledby="cf-accounts">
          <header className="border-b px-4 py-2.5">
            <h3 id="cf-accounts" className="text-sm font-medium">
              How each account was classified
            </h3>
          </header>
          <div className="max-h-[26rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]">
                <tr>
                  <th scope="col" className={TH}>
                    Account
                  </th>
                  <th scope="col" className={TH}>
                    Role
                  </th>
                  <th scope="col" className={TH}>
                    Source
                  </th>
                  <th scope="col" className={TH_NUM}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((row) => (
                  <tr key={row.account} className="border-t hover:bg-muted/40">
                    <th scope="row" className={cn(TD, "text-left font-normal")}>
                      <Link href={accountHref(base, row.account, queryString)} className="font-mono text-[13px] hover:underline">
                        {row.account}
                      </Link>
                    </th>
                    <td className={TD}>
                      <span className={cn("inline-flex h-5 items-center rounded px-1.5 text-[10px] font-medium tracking-wide uppercase", ROLE_TONE[row.role] ?? ROLE_TONE.excluded)}>{row.role}</span>
                    </td>
                    <td className={cn(TD, "text-xs text-muted-foreground")}>{row.declared ? "Declared in ledger" : "Heuristic"}</td>
                    <td className={TD_NUM}>
                      <BalanceAmounts balance={row.total} precisions={precisions} colored />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-4">
          <Card className="animate-rise [animation-delay:200ms]">
            <CardContent>
              <h3 className="mb-2 text-sm font-medium">Cash accounts</h3>
              {data.cashAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No account was classified as cash, so opening and closing cash are empty.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {data.cashAccounts.map((cash) => (
                    <li key={cash.account}>
                      <Link
                        href={accountHref(base, cash.account, queryString)}
                        title={cash.declared ? "Declared with cash-flow-role" : "Detected by name"}
                        className="inline-flex items-center gap-1.5 rounded-md border bg-surface px-2 py-0.5 font-mono text-xs hover:border-foreground/30"
                      >
                        <span className={cn("size-1.5 rounded-full", cash.declared ? "bg-positive" : "bg-muted-foreground/50")} aria-hidden />
                        {cash.account}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card className="animate-rise [animation-delay:240ms]">
            <CardContent className="space-y-2 text-sm">
              <h3 className="text-sm font-medium">Override the classification</h3>
              <p className="text-muted-foreground">
                Roles are guessed from account names. Add a <code className="font-mono text-xs text-foreground">cash-flow-role</code> metadata key to an account&apos;s <code className="font-mono text-xs text-foreground">open</code> directive to override the guess with{" "}
                <span className="font-mono text-xs">cash</span>, <span className="font-mono text-xs">operating</span>, <span className="font-mono text-xs">investing</span>, <span className="font-mono text-xs">financing</span> or{" "}
                <span className="font-mono text-xs">excluded</span>.
              </p>
              <pre className="overflow-x-auto rounded-md bg-surface p-2.5 font-mono text-xs leading-5">{`2023-01-01 open Assets:Brokerage
  cash-flow-role: "investing"`}</pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
