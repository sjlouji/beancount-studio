"use client";

import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { addBalances, HierarchyTable, type SummaryRow } from "@/components/ledger/hierarchy-table";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { treeTable, type ExportReport } from "@/components/reports/export";
import { ExportMenu } from "@/components/reports/export-menu";
import { dropRounding, rangeLabel } from "@/components/reports/helpers";
import { Button } from "@/components/ui/button";
import { useTrialBalance } from "@/lib/api/hooks";
import type { Balance } from "@/lib/api/types";

export default function TrialBalancePage() {
  const { owner, slug, params, conversion, precisions, base, queryString, ledger } = useLedgerContext();
  const query = useTrialBalance(owner, slug, { ...params, conversion });

  if (query.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Reports" title="Trial balance" />
        <CardSkeleton rows={10} />
      </div>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const { tree, dateRange } = query.data;
  const roots = tree.children;
  // In double-entry bookkeeping every root account sums to zero together.
  const sum = dropRounding(
    roots.reduce<Balance>((acc, root) => addBalances(acc, root.balanceChildren), {}),
    precisions,
  );
  const summaryRows: SummaryRow[] = [
    ...roots.map((root) => ({ label: `Total ${root.account}`, balance: root.balanceChildren })),
    { label: "Sum of all accounts (zero when balanced)", balance: sum, emphasis: true },
  ];

  const buildReport = (): ExportReport => ({
    title: `Trial balance · ${ledger.title}`,
    subtitle: `${rangeLabel(dateRange)} · converted to ${conversion}`,
    tables: [treeTable({ title: "Trial balance", root: tree, precisions, summary: summaryRows })],
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="Trial balance"
        description={`Every account and its balance, grouped by root · ${rangeLabel(dateRange)}`}
        actions={<ExportMenu fileName={`trial-balance-${slug}`} build={buildReport} printable />}
      />
      {roots.length === 0 ? (
        <EmptyState
          title="No accounts in this period"
          description="Open accounts and record transactions, or widen the time range in the filter bar."
          action={
            <Button asChild variant="outline">
              <Link href={`${base}/journal${queryString}`}>Open the journal</Link>
            </Button>
          }
        />
      ) : (
        <HierarchyTable className="animate-rise [animation-delay:80ms]" title="All accounts" root={tree} hideRoot initialDepth={2} summaryRows={summaryRows} />
      )}
    </div>
  );
}
