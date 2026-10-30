"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { IntervalBarChart } from "@/components/charts/interval-bar-chart";
import { HierarchyTable, negate } from "@/components/ledger/hierarchy-table";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { ChartTabsCard } from "@/components/reports/chart-tabs-card";
import { buildTable, treeTable, type ExportReport } from "@/components/reports/export";
import { ExportMenu } from "@/components/reports/export-menu";
import { flipIf, isZero, rangeLabel } from "@/components/reports/helpers";
import { StatementSummary } from "@/components/reports/statement-summary";
import { Button } from "@/components/ui/button";
import { useIncomeStatement } from "@/lib/api/hooks";
import { primaryUnit } from "@/lib/format";

export default function IncomeStatementPage() {
  const { workspace, slug, params, conversion, precisions, invert, base, queryString, ledger } = useLedgerContext();
  const query = useIncomeStatement(workspace, slug, { ...params, conversion });
  const interval = params.interval ?? "month";
  const data = query.data;

  // The API keeps Beancount's sign convention unless the invert option is on, so income and
  // net profit come back negative. Charts always show "earned" and "profit" as positive.
  const charts = useMemo(() => {
    if (!data) return null;
    return {
      netProfit: flipIf(data.charts.netProfit, !invert),
      income: flipIf(data.charts.income, !invert),
      expenses: data.charts.expenses,
    };
  }, [data, invert]);
  const unit = useMemo(() => primaryUnit(data?.charts.netProfit.map((d) => d.balance) ?? [], conversion), [data, conversion]);

  if (query.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Reports" title="Income statement" />
        <CardSkeleton rows={8} />
        <div className="grid gap-4 lg:grid-cols-2">
          <CardSkeleton rows={6} />
          <CardSkeleton rows={6} />
        </div>
      </div>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!data || !charts) return null;

  const { trees } = data;
  const period = rangeLabel(data.dateRange);
  const totalIncome = negate(trees.income.balanceChildren);
  const totalExpenses = trees.expenses.balanceChildren;
  const netProfit = negate(trees.netProfit.balanceChildren);
  const rate = unit && (totalIncome[unit] ?? 0) > 0 ? ((netProfit[unit] ?? 0) / totalIncome[unit]!) * 100 : null;

  const header = (
    <PageHeader
      eyebrow="Reports"
      title="Income statement"
      description={`What came in and what went out · ${period}`}
      actions={<ExportMenu fileName={`income-statement-${slug}`} build={buildReport} />}
    />
  );

  function buildReport(): ExportReport {
    return {
      title: `Income statement · ${ledger.title}`,
      subtitle: `${period} · converted to ${conversion}`,
      tables: [
        treeTable({ title: "Income", root: trees.income, precisions, invert, summary: [{ label: "Total income", balance: trees.income.balanceChildren }] }),
        treeTable({ title: "Expenses", root: trees.expenses, precisions, summary: [{ label: "Total expenses", balance: trees.expenses.balanceChildren }] }),
        buildTable({
          title: "Net profit",
          leadHeaders: ["Measure"],
          valueHeaders: ["Amount"],
          precisions,
          rows: [
            { lead: ["Total income"], values: [totalIncome] },
            { lead: ["Total expenses"], values: [totalExpenses] },
            { lead: ["Net profit"], values: [netProfit] },
          ],
        }),
      ],
    };
  }

  const nothing = isZero(trees.income.balanceChildren) && isZero(trees.expenses.balanceChildren) && charts.netProfit.length === 0;
  if (nothing) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          title="No income or expenses in this period"
          description="Widen the time range in the filter bar, or record income and expense transactions to see the statement."
          action={
            <Button asChild variant="outline">
              <Link href={`${base}/journal${queryString}`}>Open the journal</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const chart = (key: "netProfit" | "income" | "expenses") => (
    <IntervalBarChart
      data={charts[key]}
      unit={unit}
      precisions={precisions}
      interval={interval}
      mode={key === "netProfit" ? "single" : "stacked"}
      label="Net profit"
      maxSeries={8}
      height={280}
    />
  );

  return (
    <div className="space-y-6">
      {header}
      <ChartTabsCard
        className="animate-rise [animation-delay:80ms]"
        title={`By ${interval}`}
        tabs={[
          { value: "netProfit", label: "Net profit", content: chart("netProfit") },
          { value: "income", label: "Income", content: chart("income") },
          { value: "expenses", label: "Expenses", content: chart("expenses") },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <HierarchyTable
          className="animate-rise [animation-delay:120ms]"
          title="Income"
          root={trees.income}
          invert={invert}
          summaryRows={[{ label: "Total income", balance: trees.income.balanceChildren, emphasis: true }]}
        />
        <HierarchyTable
          className="animate-rise [animation-delay:160ms]"
          title="Expenses"
          root={trees.expenses}
          summaryRows={[{ label: "Total expenses", balance: trees.expenses.balanceChildren, emphasis: true }]}
        />
      </div>
      <StatementSummary
        className="animate-rise [animation-delay:200ms]"
        title="Net profit"
        precisions={precisions}
        items={[
          { label: "Total income", balance: totalIncome },
          { label: "Total expenses", balance: totalExpenses },
          { label: "Net profit", balance: netProfit, colored: true, emphasis: true, hint: rate !== null ? `${rate.toFixed(0)}% of income kept` : undefined },
        ]}
        footer={invert ? undefined : "Tables follow Beancount's sign convention (income is negative). Summary and charts show earnings as positive."}
      />
    </div>
  );
}
