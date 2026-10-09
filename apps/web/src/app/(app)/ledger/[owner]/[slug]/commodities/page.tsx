"use client";

import { FileCodeIcon } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { PriceCard } from "@/components/data/price-card";
import { EntryContextSheet } from "@/components/ledger/entry-context-sheet";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCommodities } from "@/lib/api/hooks";

const PRICE_EXAMPLE = `2025-01-31 price GLD  198.93 USD
2025-01-31 commodity GLD
  name: "SPDR Gold Trust"`;

export default function CommoditiesPage() {
  const { owner, slug, params, canWrite } = useLedgerContext();
  const report = useCommodities(owner, slug, params);
  const [sourceHash, setSourceHash] = useState<string | null>(null);

  if (report.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Commodities" title="Prices and declared commodities" />
        <div className="grid gap-4 lg:grid-cols-2">
          <CardSkeleton rows={6} />
          <CardSkeleton rows={6} />
        </div>
      </div>
    );
  }
  if (report.isError) return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  const { pairs, names, declared, precisions } = report.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commodities"
        title="Prices and declared commodities"
        description="Price history for every commodity pair in scope, and the commodities you have declared with their metadata."
      />

      {pairs.length === 0 ? (
        <EmptyState
          title="No prices in this scope"
          description={
            <>
              Record prices with the <code className="font-mono text-xs">price</code> directive and they will chart here. Widen the time filter if you expected some.
              <pre className="mx-auto mt-3 w-fit rounded-lg border bg-surface p-3 text-left font-mono text-xs">{PRICE_EXAMPLE}</pre>
            </>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pairs.map((pair, i) => (
            <PriceCard key={`${pair.base}/${pair.quote}`} pair={pair} name={names[pair.base]} precisions={precisions} delay={Math.min(i, 6) * 40} />
          ))}
        </div>
      )}

      <section className="animate-rise overflow-hidden rounded-xl border bg-card card-elevated [animation-delay:120ms]">
        <header className="border-b px-4 py-2.5">
          <h2 className="text-sm font-medium">Declared commodities</h2>
        </header>
        {declared.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No <code className="font-mono text-xs">commodity</code> directives yet. Declare one to give a currency a name and metadata.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Currency</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Declared</TableHead>
                <TableHead>Metadata</TableHead>
                <TableHead className="text-right">Precision</TableHead>
                {canWrite && (
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {declared.map((commodity) => {
                const extra = Object.entries(commodity.meta).filter(([key]) => key !== "name");
                return (
                  <TableRow key={commodity.entryHash}>
                    <TableCell className="font-mono text-[13px] font-medium">{commodity.currency}</TableCell>
                    <TableCell>{names[commodity.currency] ?? <span className="text-muted-foreground">–</span>}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{commodity.date}</TableCell>
                    <TableCell>
                      {extra.length > 0 && (
                        <span className="flex flex-wrap gap-1">
                          {extra.map(([key, value]) => (
                            <Badge key={key} variant="outline" className="max-w-64 font-mono text-[11px]">
                              <span className="text-muted-foreground">{key}:</span>
                              <span className="truncate">{String(value)}</span>
                            </Badge>
                          ))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular text-right">{precisions[commodity.currency] ?? <span className="text-muted-foreground">–</span>}</TableCell>
                    {canWrite && (
                      <TableCell>
                        <Button variant="ghost" size="icon-xs" aria-label={`View source of ${commodity.currency}`} onClick={() => setSourceHash(commodity.entryHash)}>
                          <FileCodeIcon />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
      <EntryContextSheet entryHash={sourceHash} onOpenChange={(open) => !open && setSourceHash(null)} />
    </div>
  );
}
