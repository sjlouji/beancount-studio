"use client";

import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, SearchIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { EntryContextSheet } from "@/components/ledger/entry-context-sheet";
import { EntryBadgeList, EntryCard } from "@/components/ledger/entry-row";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Toggle } from "@/components/ui/toggle";
import { ledgerPath, useJournal } from "@/lib/api/hooks";
import { buildQuery } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const ALL_TYPES = ["Transaction", "Balance", "Open", "Close", "Note", "Document", "Pad", "Price", "Event", "Query", "Custom", "Commodity"];
const DEFAULT_TYPES = ["Transaction", "Balance", "Note", "Document", "Pad", "Event"];
const PAGE_SIZE = 50;

export default function JournalPage() {
  const { owner, slug, params } = useLedgerContext();
  const router = useRouter();
  const search = useSearchParams();
  const offset = Number(search.get("offset") ?? 0) || 0;
  const [types, setTypes] = useState<Set<string>>(() => new Set(DEFAULT_TYPES));
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState(search.get("q") ?? "");
  const [debounced, setDebounced] = useState(query);
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [openEntry, setOpenEntry] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const journal = useJournal(owner, slug, { ...params, types: Array.from(types), flags: Array.from(flags), search: debounced, offset, limit: PAGE_SIZE, order });

  const setOffset = (next: number) => {
    const sp = new URLSearchParams(search.toString());
    if (next > 0) sp.set("offset", String(next));
    else sp.delete("offset");
    router.replace(`?${sp.toString()}`, { scroll: false });
  };

  useEffect(() => {
    // Reset paging when the scope changes.
    setOffset(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, params.time, params.account, params.filter, Array.from(types).join(","), Array.from(flags).join(",")]);

  const total = journal.data?.total ?? 0;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);
  const plaintextHref = useMemo(() => `/api${ledgerPath(owner, slug)}/journal/plaintext${buildQuery({ time: params.time, account: params.account, filter: params.filter })}`, [owner, slug, params]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Journal"
        title="Every entry, in order"
        description="Transactions, balances, notes and the other directives in scope. Click an entry to inspect balances and edit its source."
        actions={
          <Button asChild variant="outline" size="sm">
            <a href={plaintextHref} download="journal.beancount">
              <DownloadIcon data-icon="inline-start" /> Export plain text
            </a>
          </Button>
        }
      />
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 card-elevated">
        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="w-full max-w-sm">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput placeholder="Search payee, narration, account, tag…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search entries" />
          </InputGroup>
          <div className="flex items-center gap-1">
            <Toggle size="sm" pressed={flags.has("*")} onPressedChange={(on) => setFlags((f) => { const n = new Set(f); if (on) n.add("*"); else n.delete("*"); return n; })} aria-label="Only cleared" className="font-mono">
              * cleared
            </Toggle>
            <Toggle size="sm" pressed={flags.has("!")} onPressedChange={(on) => setFlags((f) => { const n = new Set(f); if (on) n.add("!"); else n.delete("!"); return n; })} aria-label="Only pending" className="font-mono">
              ! pending
            </Toggle>
          </div>
          <Select value={order} onValueChange={(v) => setOrder(v as "asc" | "desc")}>
            <SelectTrigger size="sm" className="ml-auto w-36" aria-label="Order">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Newest first</SelectItem>
              <SelectItem value="asc">Oldest first</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <EntryBadgeList
          types={ALL_TYPES}
          active={types}
          onToggle={(type) =>
            setTypes((prev) => {
              const next = new Set(prev);
              if (next.has(type)) next.delete(type);
              else next.add(type);
              return next;
            })
          }
        />
      </div>

      {journal.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} rows={2} />
          ))}
        </div>
      ) : journal.isError ? (
        <ErrorState error={journal.error} onRetry={() => void journal.refetch()} />
      ) : journal.data.entries.length === 0 ? (
        <EmptyState title="No entries match" description="Try widening the time range, clearing the search, or enabling more entry types." />
      ) : (
        <div className={cn("space-y-1.5 transition-opacity", journal.isFetching && "opacity-70")}>
          {journal.data.entries.map((entry) => (
            <EntryCard key={entry.entryHash} entry={entry} onOpen={(e) => setOpenEntry(e.entryHash)} />
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
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
    </div>
  );
}
