"use client";

import { BanIcon, ListIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, ErrorState } from "@/components/app/states";
import { BalanceLineChart } from "@/components/charts/balance-line-chart";
import { IntervalBarChart } from "@/components/charts/interval-bar-chart";
import { negate } from "@/components/ledger/hierarchy-table";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { NewEntryDialog } from "@/components/ledger/new-entry-dialog";
import { AccountJournalCard } from "@/components/reports/account-journal-card";
import { AccountPeriodTable } from "@/components/reports/account-period-table";
import { ChartTabsCard } from "@/components/reports/chart-tabs-card";
import { flipIf } from "@/components/reports/helpers";
import { Button } from "@/components/ui/button";
import { useAccountReport, useAccounts } from "@/lib/api/hooks";
import { accountLeaf, formatDate, primaryUnit } from "@/lib/format";

function metaValue(value: unknown): string {
  return typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
}

export default function AccountPage({ params: routeParams }: { params: Promise<{ account: string }> }) {
  const account = decodeURIComponent(use(routeParams).account);
  const { owner, slug, params, conversion, precisions, invert, canWrite, meta, href } = useLedgerContext();
  const report = useAccountReport(owner, slug, account, { ...params, conversion });
  const accounts = useAccounts(owner, slug);
  const [dialog, setDialog] = useState<"Transaction" | "Close" | null>(null);
  const interval = params.interval ?? "month";

  // Income, liabilities and equity are displayed positive when the invert option is on.
  const inverted = useMemo(() => {
    if (!invert || !meta) return false;
    return [meta.options.nameIncome, meta.options.nameLiabilities, meta.options.nameEquity].some((root) => account === root || account.startsWith(`${root}:`));
  }, [invert, meta, account]);

  const data = report.data;
  const unit = useMemo(() => primaryUnit(data?.charts.balance.map((d) => d.balance) ?? [], conversion), [data, conversion]);
  const hasChildren = useMemo(() => Boolean(data?.charts.changes.some((item) => Object.keys(item.accountBalances).some((a) => a !== account))), [data, account]);

  if (report.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Account" title={<span className="font-mono text-2xl md:text-3xl">{account}</span>} />
        <CardSkeleton rows={8} />
        <CardSkeleton rows={4} />
      </div>
    );
  }
  if (report.isError) return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  if (!data) return null;

  const detail = accounts.data?.find((a) => a.account === account);
  const metaChips = Object.entries(data.meta).filter(([key]) => !key.startsWith("__"));

  const description = (
    <span className="flex flex-col gap-2">
      <span>
        {detail ? `Opened ${formatDate(detail.openedAt)}` : accounts.isError ? "Opening date unavailable" : accounts.isPending ? "Loading account details…" : "Parent account (not opened directly)"}
        {data.closedAt ? ` · Closed ${formatDate(data.closedAt)}` : ""}
        {detail && detail.currencies.length > 0 ? ` · ${detail.currencies.join(", ")}` : ""}
      </span>
      {metaChips.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {metaChips.map(([key, value]) => (
            <span key={key} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px]">
              <span className="font-mono">{key}</span>
              <span className="text-foreground">{metaValue(value)}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title={<span className="font-mono text-2xl break-all md:text-3xl">{account}</span>}
        description={description}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={href("/journal", { account })}>
                <ListIcon data-icon="inline-start" /> View in journal
              </Link>
            </Button>
            {canWrite && !data.closedAt && (
              <Button variant="outline" size="sm" onClick={() => setDialog("Close")}>
                <BanIcon data-icon="inline-start" /> Close account
              </Button>
            )}
            {canWrite && (
              <Button size="sm" onClick={() => setDialog("Transaction")}>
                <PlusIcon data-icon="inline-start" /> New entry
              </Button>
            )}
          </>
        }
      />

      <ChartTabsCard
        className="animate-rise [animation-delay:80ms]"
        title={accountLeaf(account)}
        tabs={[
          {
            value: "balance",
            label: "Balance",
            content: (
              <BalanceLineChart
                series={[{ label: accountLeaf(account), data: inverted ? data.charts.balance.map((p) => ({ ...p, balance: negate(p.balance) })) : data.charts.balance, color: "var(--chart-1)" }]}
                unit={unit}
                precisions={precisions}
                interval={interval}
                height={260}
              />
            ),
          },
          {
            value: "changes",
            label: "Changes",
            content: <IntervalBarChart data={flipIf(data.charts.changes, inverted)} unit={unit} precisions={precisions} interval={interval} mode={hasChildren ? "stacked" : "single"} label={accountLeaf(account)} height={260} />,
          },
        ]}
      />

      <div className="animate-rise [animation-delay:120ms]">
        <AccountPeriodTable report={data} interval={interval} inverted={inverted} />
      </div>
      <div className="animate-rise [animation-delay:160ms]">
        <AccountJournalCard account={account} inverted={inverted} />
      </div>

      <NewEntryDialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)} initialKind={dialog ?? "Transaction"} initialAccount={account} />
    </div>
  );
}
