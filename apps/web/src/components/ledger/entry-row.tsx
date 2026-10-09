"use client";

import { FileTextIcon, HashIcon, LinkIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Amount } from "@/components/app/amount";
import { Badge } from "@/components/ui/badge";
import type { Entry, Posting } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { accountHref, useLedgerContext } from "./ledger-context";

const TYPE_TONE: Record<string, string> = {
  Transaction: "bg-primary/10 text-primary",
  Balance: "bg-chart-1/15 text-chart-1",
  Open: "bg-chart-3/15 text-chart-3",
  Close: "bg-muted text-muted-foreground",
  Note: "bg-chart-4/15 text-chart-4",
  Document: "bg-chart-7/15 text-chart-7",
  Pad: "bg-chart-5/15 text-chart-5",
  Price: "bg-chart-2/15 text-chart-2",
  Event: "bg-chart-6/15 text-chart-6",
  Query: "bg-muted text-muted-foreground",
  Custom: "bg-muted text-muted-foreground",
  Commodity: "bg-muted text-muted-foreground",
};

export function EntryTypeBadge({ type, flag }: { type: string; flag?: string }) {
  if (type === "Transaction") {
    const pending = flag === "!";
    return (
      <span className={cn("inline-flex size-5 items-center justify-center rounded font-mono text-[11px] font-semibold", pending ? "bg-warning/20 text-warning-foreground dark:text-warning" : "bg-primary/10 text-primary")} title={pending ? "Pending" : "Cleared"}>
        {flag ?? "*"}
      </span>
    );
  }
  return <span className={cn("inline-flex h-5 items-center rounded px-1.5 text-[10px] font-medium uppercase tracking-wide", TYPE_TONE[type] ?? "bg-muted text-muted-foreground")}>{type}</span>;
}

export function entryTitle(entry: Entry): { primary: string; secondary?: string } {
  switch (entry.type) {
    case "Transaction":
      return { primary: entry.payee || entry.narration || "(no description)", secondary: entry.payee ? entry.narration : undefined };
    case "Balance":
      return { primary: entry.account ?? "", secondary: entry.amount ? `${entry.amount.number} ${entry.amount.currency}` : undefined };
    case "Open":
      return { primary: entry.account ?? "", secondary: entry.currencies?.length ? entry.currencies.join(", ") : undefined };
    case "Close":
    case "Pad":
      return { primary: entry.account ?? "", secondary: entry.source_account ? `from ${entry.source_account}` : undefined };
    case "Note":
      return { primary: entry.account ?? "", secondary: entry.comment };
    case "Document":
      return { primary: entry.account ?? "", secondary: entry.basename ?? entry.documentPath ?? undefined };
    case "Price":
      return { primary: entry.currency ?? "", secondary: entry.amount ? `${entry.amount.number} ${entry.amount.currency}` : undefined };
    case "Event":
      return { primary: entry.type_ ?? "event", secondary: entry.description };
    case "Commodity":
      return { primary: entry.currency ?? "" };
    case "Query":
      return { primary: entry.name ?? "query", secondary: entry.query_string };
    case "Custom":
      return { primary: entry.type_ ?? "custom", secondary: Array.isArray(entry.values) ? entry.values.map(String).join(" ") : undefined };
    default:
      return { primary: entry.type };
  }
}

export function PostingLine({ posting, precisions, base, queryString }: { posting: Posting; precisions: Record<string, number>; base: string; queryString: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 font-mono text-[12.5px] leading-6">
      <Link href={accountHref(base, posting.account, queryString)} className="truncate text-muted-foreground hover:text-foreground hover:underline">
        {posting.account}
      </Link>
      <span className="flex shrink-0 items-baseline gap-2">
        {posting.cost && <span className="text-[11px] text-muted-foreground">{`{${posting.cost.number} ${posting.cost.currency}}`}</span>}
        {posting.price && <span className="text-[11px] text-muted-foreground">@ {posting.price.number} {posting.price.currency}</span>}
        {posting.units ? <Amount value={posting.units.number} currency={posting.units.currency} precisions={precisions} colored /> : <span className="text-muted-foreground">auto</span>}
      </span>
    </div>
  );
}

/** One journal entry: header line plus postings. Used by the journal, account and entry pages. */
export function EntryCard({ entry, onOpen, actions, className, compact = false }: { entry: Entry; onOpen?: (entry: Entry) => void; actions?: ReactNode; className?: string; compact?: boolean }) {
  const { base, queryString, precisions } = useLedgerContext();
  const title = entryTitle(entry);
  const tags = entry.tags ?? [];
  const links = entry.links ?? [];
  const metaEntries = Object.entries(entry.meta ?? {}).filter(([k]) => !k.startsWith("__"));
  return (
    <article className={cn("group rounded-lg border bg-card px-3 py-2 transition-colors hover:border-foreground/20", className)}>
      <div className="flex items-start gap-3">
        <time dateTime={entry.date} className="w-[5.5rem] shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">
          {entry.date}
        </time>
        <EntryTypeBadge type={entry.type} flag={entry.flag} />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => onOpen?.(entry)} className="block max-w-full truncate text-left text-sm font-medium hover:underline disabled:no-underline" disabled={!onOpen}>
            {title.primary}
          </button>
          {title.secondary && <div className="truncate text-xs text-muted-foreground">{title.secondary}</div>}
          {(tags.length > 0 || links.length > 0) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Link key={tag} href={`${base}/journal?filter=${encodeURIComponent(`#${tag}`)}`} className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 text-[11px] text-muted-foreground hover:text-foreground">
                  <HashIcon className="size-2.5" />
                  {tag}
                </Link>
              ))}
              {links.map((link) => (
                <Link key={link} href={`${base}/journal?filter=${encodeURIComponent(`^${link}`)}`} className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 text-[11px] text-muted-foreground hover:text-foreground">
                  <LinkIcon className="size-2.5" />
                  {link}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {actions}
          {entry.filename && (
            <Link href={`${base}/files/edit?path=${encodeURIComponent(entry.filename)}&line=${entry.lineno ?? 1}`} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title={`${entry.filename}:${entry.lineno}`}>
              <FileTextIcon className="size-3.5" />
            </Link>
          )}
        </div>
      </div>
      {!compact && entry.postings && entry.postings.length > 0 && (
        <div className="mt-1.5 ml-[6.75rem] border-l pl-3">
          {entry.postings.map((posting, i) => (
            <PostingLine key={i} posting={posting} precisions={precisions} base={base} queryString={queryString} />
          ))}
        </div>
      )}
      {!compact && metaEntries.length > 0 && (
        <div className="mt-1 ml-[6.75rem] flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {metaEntries.map(([k, v]) => (
            <span key={k}>
              <span className="font-mono">{k}</span>: {typeof v === "object" ? JSON.stringify(v) : String(v)}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

export function EntryBadgeList({ types, onToggle, active }: { types: string[]; active: Set<string>; onToggle: (type: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {types.map((type) => (
        <Badge key={type} asChild variant={active.has(type) ? "default" : "outline"}>
          <button type="button" onClick={() => onToggle(type)} aria-pressed={active.has(type)}>
            {type}
          </button>
        </Badge>
      ))}
    </div>
  );
}
