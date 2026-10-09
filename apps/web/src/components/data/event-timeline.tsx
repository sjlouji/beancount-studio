"use client";

import { ChevronRightIcon } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { apiGet } from "@/lib/api/client";
import { keys, ledgerPath } from "@/lib/api/hooks";
import type { Entry, FileContent } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export const UNKNOWN_EVENT_TYPE = "(unknown type)";

const EVENT_LINE = /^\s*\d{4}-\d{2}-\d{2}\s+event\s+"((?:[^"\\]|\\.)*)"/;

/**
 * The API's entry serialiser overwrites an event's `type_` with the directive kind, so the
 * event type is missing from `/events`. When `type_` is absent we recover it from the source
 * line of each event (one cached file read per distinct file).
 */
export function useEventTypes(owner: string, slug: string, events: Entry[] | undefined) {
  const filenames = useMemo(() => Array.from(new Set((events ?? []).filter((e) => !e.type_ && e.filename).map((e) => e.filename!))), [events]);
  const files = useQueries({
    queries: filenames.map((path) => ({
      queryKey: keys.ledgerScope(owner, slug, "file", path, "HEAD"),
      queryFn: () => apiGet<FileContent>(`${ledgerPath(owner, slug)}/files/content`, { path }),
    })),
  });

  const pending = files.some((f) => f.isPending);
  const error = files.find((f) => f.isError)?.error ?? null;
  const contentKey = files.map((f) => f.dataUpdatedAt).join(",");

  const types = useMemo(() => {
    const lines = new Map<string, string[]>();
    filenames.forEach((name, i) => {
      const text = files[i]?.data?.content;
      if (text !== undefined) lines.set(name, text.split("\n"));
    });
    const out = new Map<string, string>();
    for (const event of events ?? []) {
      if (event.type_) {
        out.set(event.entryHash, event.type_);
        continue;
      }
      const line = event.filename && event.lineno ? lines.get(event.filename)?.[event.lineno - 1] : undefined;
      out.set(event.entryHash, (line && EVENT_LINE.exec(line)?.[1]) || UNKNOWN_EVENT_TYPE);
    }
    return out;
    // `files` is a fresh array each render; `contentKey` changes exactly when a file's data does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, filenames, contentKey]);

  return { types, pending, error };
}

/** A collapsible vertical timeline for one event type, newest first. */
export function EventTimeline({ type, events, onOpen }: { type: string; events: Entry[]; onOpen: (entryHash: string) => void }) {
  return (
    <Collapsible defaultOpen asChild>
      <section className="rounded-xl border bg-card card-elevated">
        <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          <h2 className="text-sm font-medium">{type}</h2>
          <span className="tabular ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{events.length}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ol className="relative mx-4 mb-4 ml-[1.35rem] border-l pl-5">
            {events.map((event, index) => (
              <li key={event.entryHash} className={cn("relative", index < events.length - 1 && "pb-3")}>
                <span aria-hidden className={cn("absolute top-1.5 -left-[1.6rem] size-2 rounded-full border-2 border-card", index === 0 ? "bg-chart-1" : "bg-muted-foreground/50")} />
                <button type="button" onClick={() => onOpen(event.entryHash)} className="-mx-2 flex w-[calc(100%+1rem)] items-baseline gap-3 rounded-md px-2 py-0.5 text-left hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                  <time className="shrink-0 font-mono text-xs text-muted-foreground">{event.date}</time>
                  <span className="truncate text-sm">{event.description}</span>
                </button>
              </li>
            ))}
          </ol>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
