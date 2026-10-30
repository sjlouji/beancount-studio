"use client";

import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { BalanceLineChart } from "@/components/charts/balance-line-chart";
import { addBalances, HierarchyTable, negate } from "@/components/ledger/hierarchy-table";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { buildTable, treeTable, type ExportReport } from "@/components/reports/export";
import { ExportMenu } from "@/components/reports/export-menu";
import { alignSeries, dropRounding, flipBalanceIf, isZero, rangeLabel } from "@/components/reports/helpers";
import { StatementSummary } from "@/components/reports/statement-summary";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useBalanceSheet } from "@/lib/api/hooks";
import { formatDate, primaryUnit } from "@/lib/format";

export default function BalanceSheetPage() {
  const { workspace, slug, params, conversion, precisions, invert, base, queryString, ledger } = useLedgerContext();
  const query = useBalanceSheet(workspace, slug, { ...params, conversion });
  const interval = params.interval ?? "month";
  const data = query.data;

  const series = useMemo(() => {
    if (!data) return null;
    const [netWorth, assets, owed] = alignSeries([data.charts.netWorth, data.charts.assets, data.charts.liabilities.map((p) => ({ ...p, balance: negate(p.balance) }))]);
    return { netWorth: netWorth!, assets: assets!, owed: owed! };
  }, [data]);
  const unit = useMemo(() => primaryUnit(data?.charts.netWorth.map((d) => d.balance) ?? [], conversion), [data, conversion]);

  if (query.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Reports" title="Balance sheet" />
        <CardSkeleton rows={8} />
        <div className="grid gap-4 lg:grid-cols-3">
          <CardSkeleton rows={6} />
          <CardSkeleton rows={6} />
          <CardSkeleton rows={6} />
        </div>
      </div>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!data || !series) return null;

  const { trees } = data;
  const asOf = data.dateRange ? formatDate(data.dateRange.endInclusive) : data.charts.netWorth.length ? formatDate(data.charts.netWorth[data.charts.netWorth.length - 1]!.date) : "today";

  // Displayed totals follow the invert option; the reconciliation is the raw Beancount sum,
  // which equals assets − (liabilities + equity) in either sign convention.
  const assets = trees.assets.balanceChildren;
  const liabilities = flipBalanceIf(trees.liabilities.balanceChildren, invert);
  const equity = flipBalanceIf(trees.equity.balanceChildren, invert);
  const liabilitiesPlusEquity = addBalances(liabilities, equity);
  const difference = dropRounding(addBalances(addBalances(assets, trees.liabilities.balanceChildren), trees.equity.balanceChildren), precisions);
  const balanced = Object.keys(difference).length === 0;

  const header = (
    <PageHeader
      eyebrow="Reports"
      title="Balance sheet"
      description={`Unaudited management statement · as of ${asOf} · ${rangeLabel(data.dateRange)}`}
      actions={<ExportMenu fileName={`balance-sheet-${slug}`} build={buildReport} />}
    />
  );

  function buildReport(): ExportReport {
    return {
      title: `Balance sheet · ${ledger.title}`,
      subtitle: `Unaudited management statement · as of ${asOf} · converted to ${conversion}`,
      tables: [
        treeTable({ title: "Assets", root: trees.assets, precisions, summary: [{ label: "Total assets", balance: assets }] }),
        treeTable({ title: "Liabilities", root: trees.liabilities, precisions, invert, summary: [{ label: "Total liabilities", balance: trees.liabilities.balanceChildren }] }),
        treeTable({ title: "Equity", root: trees.equity, precisions, invert, summary: [{ label: "Total equity", balance: trees.equity.balanceChildren }] }),
        buildTable({
          title: "Summary",
          leadHeaders: ["Measure"],
          valueHeaders: ["Amount"],
          precisions,
          rows: [
            { lead: ["Total assets"], values: [assets] },
            { lead: ["Total liabilities"], values: [liabilities] },
            { lead: ["Total equity"], values: [equity] },
            { lead: ["Liabilities + equity"], values: [liabilitiesPlusEquity] },
            { lead: ["Assets - (liabilities + equity)"], values: [difference] },
          ],
        }),
      ],
    };
  }

  if (isZero(assets) && isZero(trees.liabilities.balanceChildren) && isZero(trees.equity.balanceChildren)) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          title="Nothing on the balance sheet yet"
          description="Open accounts and record transactions or balances to see assets, liabilities and equity."
          action={
            <Button asChild variant="outline">
              <Link href={`${base}/journal${queryString}`}>Open the journal</Link>
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
          <h2 className="mb-2 text-sm font-medium">Net worth, assets and liabilities</h2>
          <BalanceLineChart
            series={[
              { label: "Net worth", data: series.netWorth, color: "var(--chart-1)" },
              { label: "Assets", data: series.assets, color: "var(--chart-3)" },
              { label: "Liabilities (owed)", data: series.owed, color: "var(--chart-2)" },
            ]}
            unit={unit}
            precisions={precisions}
            interval={interval}
            height={280}
          />
          <p className="mt-1 text-xs text-muted-foreground">Liabilities are plotted as the amount owed, so they read positive.</p>
        </CardContent>
      </Card>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <HierarchyTable className="animate-rise [animation-delay:120ms]" title="Assets" root={trees.assets} summaryRows={[{ label: "Total assets", balance: assets, emphasis: true }]} />
        <HierarchyTable className="animate-rise [animation-delay:160ms]" title="Liabilities" root={trees.liabilities} invert={invert} summaryRows={[{ label: "Total liabilities", balance: trees.liabilities.balanceChildren, emphasis: true }]} />
        <HierarchyTable className="animate-rise [animation-delay:200ms]" title="Equity" root={trees.equity} invert={invert} summaryRows={[{ label: "Total equity", balance: trees.equity.balanceChildren, emphasis: true }]} />
      </div>
      <StatementSummary
        className="animate-rise [animation-delay:240ms]"
        title="Reconciliation"
        precisions={precisions}
        items={[
          { label: "Total assets", balance: assets },
          { label: "Total liabilities", balance: liabilities },
          { label: "Total equity", balance: equity },
          { label: "Liabilities + equity", balance: liabilitiesPlusEquity },
          {
            label: "Assets − (liabilities + equity)",
            balance: difference,
            emphasis: true,
            hint: balanced ? (
              <span className="inline-flex items-center gap-1 text-positive">
                <CheckCircle2Icon className="size-3.5" /> Balanced
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-negative">
                <TriangleAlertIcon className="size-3.5" /> Does not reconcile
              </span>
            ),
          },
        ]}
        footer={`Unaudited management statement generated from the ledger. Amounts are converted to ${conversion} where prices are available.`}
      />
    </div>
  );
}
