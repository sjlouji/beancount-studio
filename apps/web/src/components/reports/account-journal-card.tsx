"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { BalanceAmounts } from "@/components/app/amount";
import { EmptyState, ErrorState } from "@/components/app/states";
import { EntryContextSheet } from "@/components/ledger/entry-context-sheet";
import { EntryCard } from "@/components/ledger/entry-row";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useAccountJournal } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

/** Entries touching an account with the change each made and the running balance after it. */
export function AccountJournalCard({ account, inverted }: { account: string; inverted: boolean }) {
  const { workspace, slug, params, conversion, precisions } = useLedgerContext();
  const [withChildren, setWithChildren] = useState(true);
  const [offset, setOffset] = useState(0);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const journal = useAccountJournal(workspace, slug, account, { ...params, conversion, offset, limit: PAGE_SIZE, withChildren });

  const total = journal.data?.total ?? 0;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Journal</h2>
          <div className="flex items-center gap-2">
            <Switch
              id="with-children"
              size="sm"
              checked={withChildren}
              onCheckedChange={(checked) => {
                setWithChildren(checked);
                setOffset(0);
              }}
            />
            <Label htmlFor="with-children" className="text-xs font-normal text-muted-foreground">
              Include sub-accounts
            </Label>
          </div>
        </div>

        {journal.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : journal.isError ? (
          <ErrorState error={journal.error} onRetry={() => void journal.refetch()} />
        ) : journal.data.items.length === 0 ? (
          <EmptyState title="No entries for this account" description="Nothing touches this account in the selected time range. Widen the range or record a transaction." />
        ) : (
          <div className={cn("space-y-1.5 transition-opacity", journal.isFetching && "opacity-70")}>
            <div className="hidden grid-cols-[minmax(0,1fr)_9rem_9rem] gap-3 px-3 text-xs text-muted-foreground md:grid">
              <span>Entry</span>
              <span className="text-right">Change</span>
              <span className="text-right">Balance</span>
            </div>
            {journal.data.items.map(({ entry, change, balance }) => (
              <div key={entry.entryHash} className="grid items-start gap-1.5 md:grid-cols-[minmax(0,1fr)_9rem_9rem] md:gap-3">
                <EntryCard entry={entry} compact onOpen={(e) => setOpenEntry(e.entryHash)} />
                <div className="flex items-baseline justify-between gap-2 px-3 md:block md:py-2 md:text-right">
                  <span className="text-xs text-muted-foreground md:hidden">Change</span>
                  <BalanceAmounts balance={change} precisions={precisions} colored invert={inverted} />
                </div>
                <div className="flex items-baseline justify-between gap-2 px-3 md:block md:py-2 md:text-right">
                  <span className="text-xs text-muted-foreground md:hidden">Balance</span>
                  <BalanceAmounts balance={balance} precisions={precisions} invert={inverted} />
                </div>
              </div>
            ))}
          </div>
        )}

        {total > PAGE_SIZE && (
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {pageStart.toLocaleString()}–{pageEnd.toLocaleString()} of {total.toLocaleString()}
              {journal.isFetching && <Spinner className="ml-2 inline size-3" />}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                <ChevronLeftIcon data-icon="inline-start" /> Previous
              </Button>
              <Button variant="outline" size="sm" disabled={pageEnd >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
                Next <ChevronRightIcon data-icon="inline-end" />
              </Button>
            </div>
          </div>
        )}
        <EntryContextSheet entryHash={openEntry} onOpenChange={(open) => !open && setOpenEntry(null)} />
      </CardContent>
    </Card>
  );
}
