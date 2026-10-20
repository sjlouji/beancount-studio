"use client";

import { ArrowRightIcon, CalendarDaysIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Amount, BalanceAmounts } from "@/components/app/amount";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { BalanceLineChart } from "@/components/charts/balance-line-chart";
import { HierarchyTreemap } from "@/components/charts/hierarchy-treemap";
import { IntervalBarChart } from "@/components/charts/interval-bar-chart";
import { EntryContextSheet } from "@/components/ledger/entry-context-sheet";
import { EntryCard } from "@/components/ledger/entry-row";
import { accountHref, useLedgerContext } from "@/components/ledger/ledger-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOverview } from "@/lib/api/hooks";
import type { Balance, IntervalTotal } from "@/lib/api/types";
import { formatCompact, formatDate, primaryUnit } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

function latest(items: Array<{ balance: Balance }>, unit: string | undefined): number {
  if (!unit || items.length === 0) return 0;
  return items[items.length - 1]!.balance[unit] ?? 0;
}

function sumIntervals(items: IntervalTotal[], unit: string | undefined): number {
  if (!unit) return 0;
  return items.reduce((s, i) => s + (i.balance[unit] ?? 0), 0);
}

function StatTile({ label, value, unit, hint, tone, delay = 0 }: { label: string; value: number; unit: string | undefined; hint?: string; tone?: "positive" | "negative" | "neutral"; delay?: number }) {
  const hintColor = tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-muted-foreground";
  return (
    <Card className="animate-rise" style={{ animationDelay: `${delay}ms` }}>
      <CardContent className="py-1">
        <div className="type-caption-2 text-muted-foreground">{label}</div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5 text-primary">
          <span className="type-title-1 tabular">{unit ? formatCompact(value, 1) : "–"}</span>
          {unit && <span className="type-footnote font-semibold whitespace-nowrap text-muted-foreground">{unit}</span>}
        </div>
        {hint && <div className={cn("mt-1 text-xs font-medium", hintColor)}>{hint}</div>}
      </CardContent>
    </Card>
  );
}

export default function OverviewPage() {
  const ctx = useLedgerContext();
  const { owner, slug, params, conversion, precisions, meta, base, queryString, invert } = ctx;
  const router = useRouter();
  const overview = useOverview(owner, slug, { ...params, conversion });
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const interval = params.interval ?? "month";

  const unit = useMemo(() => primaryUnit(overview.data?.netWorth.map((d) => d.balance) ?? [], conversion), [overview.data, conversion]);

  if (overview.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={`${ctx.owner}/${ctx.slug}`} title="Overview" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} rows={1} />
          ))}
        </div>
        <CardSkeleton rows={8} />
      </div>
    );
  }
  if (overview.isError) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />;
  const data = overview.data;

  if (data.transactionsCount === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={`${ctx.owner}/${ctx.slug}`} title="Overview" description={ctx.ledger.description} />
        <EmptyState
          title="This ledger has no transactions yet"
          description="Add your first transaction, import a bank statement, or ask the assistant to set things up."
          action={
            <div className="flex gap-2">
              <Button asChild>
                <Link href={`${base}/import`}>Import a statement</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`${base}/files/edit?path=${encodeURIComponent(meta?.favaOptions.defaultFile ?? "main.bean")}`}>Open the editor</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const income = sumIntervals(data.incomeIntervals, unit);
  const expenses = sumIntervals(data.expensesIntervals, unit);
  const net = income - expenses;
  const savingsRate = income > 0 ? (net / income) * 100 : 0;
  const lastInterval = data.expensesIntervals[data.expensesIntervals.length - 1];
  const periodLabel = data.dateRange ? `${formatDate(data.dateRange.begin)} – ${formatDate(data.dateRange.endInclusive)}` : "All time";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title={ctx.ledger.title}
        description={ctx.ledger.description || periodLabel}
        actions={
          data.errorsCount > 0 ? (
            <Button asChild variant="outline" className="border-negative/40 text-negative hover:text-negative">
              <Link href={`${base}/errors`}>
                <TriangleAlertIcon data-icon="inline-start" /> {data.errorsCount} ledger {data.errorsCount === 1 ? "error" : "errors"}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Net worth" value={latest(data.netWorthAtValue, unit)} unit={unit} hint={`at market value · ${data.netWorth.length ? formatDate(data.netWorth[data.netWorth.length - 1]!.date) : ""}`} />
        <StatTile label="Income" value={income} unit={unit} hint={periodLabel} delay={40} />
        <StatTile label="Expenses" value={expenses} unit={unit} hint={lastInterval ? `${formatCompact(lastInterval.balance[unit ?? ""] ?? 0)} ${unit} in the latest ${interval}` : undefined} delay={80} />
        <StatTile label="Saved" value={net} unit={unit} hint={income > 0 ? `${savingsRate.toFixed(0)}% savings rate` : "No income in scope"} tone={net >= 0 ? "positive" : "negative"} delay={120} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="animate-rise lg:col-span-3 [animation-delay:160ms]">
          <CardContent>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium">Net worth</h2>
              <Link href={`${base}/balance-sheet${queryString}`} className="text-xs text-muted-foreground hover:text-foreground">
                Balance sheet <ArrowRightIcon className="inline size-3" />
              </Link>
            </div>
            <BalanceLineChart
              series={[
                { label: "At market value", data: data.netWorthAtValue, color: "var(--chart-1)" },
                { label: "At cost", data: data.netWorth, color: "var(--chart-3)" },
              ]}
              unit={unit}
              precisions={precisions}
              interval={interval}
              height={280}
            />
          </CardContent>
        </Card>
        <Card className="animate-rise lg:col-span-2 [animation-delay:200ms]">
          <CardContent>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium">Income vs. expenses</h2>
              <Link href={`${base}/income-statement${queryString}`} className="text-xs text-muted-foreground hover:text-foreground">
                Income statement <ArrowRightIcon className="inline size-3" />
              </Link>
            </div>
            <IntervalBarChart data={data.netProfitIntervals.slice(-24)} unit={unit} precisions={precisions} interval={interval} label="Net profit" height={280} onBarClick={(date) => router.push(`${base}/income-statement?time=${date.slice(0, interval === "year" ? 4 : 7)}`)} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="animate-rise lg:col-span-3 [animation-delay:240ms]">
          <CardContent>
            <Tabs defaultValue="expenses">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-medium">Where the money goes</h2>
                <TabsList className="h-7">
                  <TabsTrigger value="expenses" className="text-xs">
                    Expenses
                  </TabsTrigger>
                  <TabsTrigger value="income" className="text-xs">
                    Income
                  </TabsTrigger>
                  <TabsTrigger value="assets" className="text-xs">
                    Assets
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="expenses">
                <HierarchyTreemap node={data.expenses} unit={unit} precisions={precisions} height={300} onSelect={(a) => router.push(accountHref(base, a, queryString))} />
              </TabsContent>
              <TabsContent value="income">
                <HierarchyTreemap node={data.income} unit={unit} precisions={precisions} height={300} invert={!invert} onSelect={(a) => router.push(accountHref(base, a, queryString))} />
              </TabsContent>
              <TabsContent value="assets">
                <HierarchyTreemap node={data.assets} unit={unit} precisions={precisions} height={300} onSelect={(a) => router.push(accountHref(base, a, queryString))} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        <Card className="animate-rise lg:col-span-2 [animation-delay:280ms]">
          <CardContent>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium">Monthly expenses by category</h2>
            </div>
            <IntervalBarChart data={data.expensesIntervals.slice(-12)} unit={unit} precisions={precisions} interval={interval} mode="stacked" maxSeries={6} height={300} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="animate-rise lg:col-span-3 [animation-delay:320ms]">
          <CardContent>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">Recent transactions</h2>
              <Link href={`${base}/journal${queryString}`} className="text-xs text-muted-foreground hover:text-foreground">
                Journal <ArrowRightIcon className="inline size-3" />
              </Link>
            </div>
            <div className="space-y-1.5">
              {data.recentTransactions.map((entry) => (
                <EntryCard key={entry.entryHash} entry={entry} onOpen={(e) => setOpenEntry(e.entryHash)} />
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="space-y-4 lg:col-span-2">
          <Card className="animate-rise [animation-delay:360ms]">
            <CardContent>
              <h2 className="mb-2 text-sm font-medium">Balances</h2>
              <dl className="divide-y text-sm">
                {[
                  { label: "Assets", node: data.assets },
                  { label: "Liabilities", node: data.liabilities, invert: true },
                ].map((row) => (
                  <div key={row.label} className="flex items-start justify-between py-1.5">
                    <dt>
                      <Link href={accountHref(base, row.node.account, queryString)} className="hover:underline">
                        {row.label}
                      </Link>
                    </dt>
                    <dd>
                      <BalanceAmounts balance={row.node.balanceChildren} precisions={precisions} invert={row.invert} />
                    </dd>
                  </div>
                ))}
                {data.assets.children.slice(0, 6).map((child) => (
                  <div key={child.account} className="flex items-start justify-between py-1.5 pl-3 text-xs">
                    <dt className="truncate">
                      <Link href={accountHref(base, child.account, queryString)} className="font-mono text-muted-foreground hover:text-foreground hover:underline">
                        {child.account.split(":").slice(1).join(":")}
                      </Link>
                    </dt>
                    <dd>{unit && <Amount value={child.balanceChildren[unit] ?? 0} currency={unit} precisions={precisions} />}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          {data.upcomingEvents.length > 0 && (
            <Card className="animate-rise [animation-delay:400ms]">
              <CardContent>
                <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                  <CalendarDaysIcon className="size-4" /> Upcoming events
                </h2>
                <ul className="space-y-1 text-sm">
                  {data.upcomingEvents.map((e) => (
                    <li key={e.entryHash} className="flex justify-between gap-3">
                      <span className="truncate">
                        <span className="text-muted-foreground">{e.type_}</span> {e.description}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">{e.date}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <EntryContextSheet entryHash={openEntry} onOpenChange={(open) => !open && setOpenEntry(null)} />
    </div>
  );
}
