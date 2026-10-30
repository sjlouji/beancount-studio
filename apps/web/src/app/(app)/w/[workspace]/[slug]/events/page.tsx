"use client";

import { CalendarDaysIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { EventTimeline, useEventTypes } from "@/components/data/event-timeline";
import { EntryContextSheet } from "@/components/ledger/entry-context-sheet";
import { EntryBadgeList } from "@/components/ledger/entry-row";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { useEvents } from "@/lib/api/hooks";
import type { Entry } from "@/lib/api/types";

const EVENT_EXAMPLE = `2025-06-01 event "location" "Lisbon, Portugal"
2025-09-15 event "employer"  "Acme Corp"`;

export default function EventsPage() {
  const { workspace, slug, params } = useLedgerContext();
  const events = useEvents(workspace, slug, params);
  const { types, pending: typesPending, error: typesError } = useEventTypes(workspace, slug, events.data);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [openEntry, setOpenEntry] = useState<string | null>(null);

  const groups = useMemo(() => {
    const byType = new Map<string, Entry[]>();
    for (const event of events.data ?? []) {
      const type = types.get(event.entryHash);
      if (!type) continue;
      byType.set(type, [...(byType.get(type) ?? []), event]);
    }
    for (const list of byType.values()) list.sort((a, b) => b.date.localeCompare(a.date));
    return Array.from(byType.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [events.data, types]);

  const typeNames = groups.map(([type]) => type);
  const active = useMemo(() => new Set(typeNames.filter((t) => !hidden.has(t))), [typeNames, hidden]);

  const header = <PageHeader eyebrow="Events" title="Life events, in time" description="Beancount `event` directives, grouped by type. Each type reads as its own timeline, newest first." />;

  if (events.isPending || (events.data?.length && typesPending)) {
    return (
      <div className="space-y-6">
        {header}
        <CardSkeleton rows={5} />
      </div>
    );
  }
  if (events.isError) return <ErrorState error={events.error} onRetry={() => void events.refetch()} />;
  if (typesError) return <ErrorState title="Couldn't read event types" error={typesError} onRetry={() => void events.refetch()} />;

  return (
    <div className="space-y-5">
      {header}
      {groups.length === 0 ? (
        <EmptyState
          icon={<CalendarDaysIcon />}
          title="No events in this scope"
          description={
            <>
              Use the <code className="font-mono text-xs">event</code> directive to track values that change over time, like where you live or who employs you.
              <pre className="mx-auto mt-3 w-fit rounded-lg border bg-surface p-3 text-left font-mono text-xs">{EVENT_EXAMPLE}</pre>
            </>
          }
        />
      ) : (
        <>
          <div className="animate-rise [animation-delay:80ms]">
            <EntryBadgeList
              types={typeNames}
              active={active}
              onToggle={(type) =>
                setHidden((prev) => {
                  const next = new Set(prev);
                  if (next.has(type)) next.delete(type);
                  else next.add(type);
                  return next;
                })
              }
            />
          </div>
          <div className="space-y-3 animate-rise [animation-delay:120ms]">
            {groups
              .filter(([type]) => active.has(type))
              .map(([type, list]) => (
                <EventTimeline key={type} type={type} events={list} onOpen={setOpenEntry} />
              ))}
            {active.size === 0 && <EmptyState title="All event types are hidden" description="Select a type above to show its timeline." />}
          </div>
        </>
      )}
      <EntryContextSheet entryHash={openEntry} onOpenChange={(open) => !open && setOpenEntry(null)} />
    </div>
  );
}
