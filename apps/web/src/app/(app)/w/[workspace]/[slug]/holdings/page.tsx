"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { HoldingsTable } from "@/components/reports/holdings-table";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useHoldings } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

type GroupBy = "lot" | "account" | "currency";

const GROUPS: Array<{ value: GroupBy; label: string; hint: string }> = [
  { value: "lot", label: "By lot", hint: "Every purchase lot with its cost basis and acquisition date." },
  { value: "account", label: "By account", hint: "Positions summed per account." },
  { value: "currency", label: "By currency", hint: "Positions summed per commodity across all accounts." },
];

export default function HoldingsPage() {
  const { workspace, slug, params, conversion, base, queryString } = useLedgerContext();
  const [groupBy, setGroupBy] = useState<GroupBy>("lot");
  const query = useHoldings(workspace, slug, groupBy, { ...params, conversion });
  const group = GROUPS.find((g) => g.value === groupBy)!;

  const header = (
    <PageHeader title="Holdings" description="What you own today at cost and at market value, with unrealized profit and loss." />
  );

  if (query.isPending) {
    return (
      <div className="space-y-6">
        {header}
        <CardSkeleton rows={8} />
      </div>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const result = query.data;

  return (
    <div className="space-y-6">
      {header}
      {/* A segmented control, not tabs: it changes how one table is grouped, it doesn't switch panels. */}
      <div className="flex animate-rise flex-wrap items-center justify-between gap-3 [animation-delay:40ms]">
        <ToggleGroup type="single" variant="outline" size="sm" value={groupBy} onValueChange={(value) => value && setGroupBy(value as GroupBy)} aria-label="Group holdings">
          {GROUPS.map((g) => (
            <ToggleGroupItem key={g.value} value={g.value}>
              {g.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">{group.hint}</p>
      </div>
      <section className={cn("animate-rise overflow-hidden rounded-xl border bg-card transition-opacity [animation-delay:60ms]", query.isFetching && "opacity-70")} aria-label={`Holdings ${group.label.toLowerCase()}`}>
        {result.type === "text" ? (
          <pre className="overflow-auto p-4 font-mono text-xs">{result.contents}</pre>
        ) : result.rows.length === 0 ? (
          <EmptyState
            className="m-4"
            title="No holdings"
            description="Holdings appear once an asset account holds a commodity, such as shares bought with a cost basis."
            action={
              <Button asChild variant="outline">
                <Link href={`${base}/accounts${queryString}`}>Browse accounts</Link>
              </Button>
            }
          />
        ) : (
          <HoldingsTable key={groupBy} result={result} />
        )}
      </section>
    </div>
  );
}
