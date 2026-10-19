"use client";

import { GitCommitHorizontalIcon, LockIcon, PlusIcon, StarIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { NewLedgerDialog } from "@/components/ledger/new-ledger-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useActivity, useLedgers, useMe } from "@/lib/api/hooks";
import type { Ledger } from "@/lib/api/types";
import { formatRelative } from "@/lib/format";

function LedgerCard({ ledger, index }: { ledger: Ledger; index: number }) {
  return (
    <Link
      href={`/ledger/${ledger.owner}/${ledger.slug}`}
      className="group block animate-rise outline-none"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-focus-visible:ring-3 group-focus-visible:ring-ring/50">
        <CardContent className="flex h-full flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-lg font-bold text-primary">
              {ledger.title.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate font-medium">{ledger.title}</h3>
                {ledger.visibility === "private" ? <LockIcon className="size-3.5 text-muted-foreground" /> : <Badge variant="outline">Public</Badge>}
              </div>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {ledger.owner}/{ledger.slug}
              </p>
            </div>
          </div>
          {ledger.description && <p className="line-clamp-2 text-sm text-muted-foreground">{ledger.description}</p>}
          <div className="mt-auto flex items-center justify-between gap-3 text-xs text-muted-foreground">
            {ledger.lastCommit ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <GitCommitHorizontalIcon className="size-3.5 shrink-0" />
                <span className="truncate">{ledger.lastCommit.subject}</span>
                <span className="shrink-0">· {formatRelative(ledger.lastCommit.author.date)}</span>
              </span>
            ) : (
              <span>No commits yet</span>
            )}
            {ledger.role !== "owner" && <Badge variant="secondary">{ledger.role}</Badge>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function Activity() {
  const activity = useActivity(15);
  if (activity.isPending) return <CardSkeleton rows={6} />;
  if (activity.isError) return <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />;
  if (activity.data.items.length === 0) return null;
  return (
    <Card className="animate-rise [animation-delay:160ms]">
      <CardContent>
        <h2 className="mb-3 text-sm font-medium">Recent activity</h2>
        <ol className="space-y-2.5">
          {activity.data.items.map((item) => (
            <li key={item.sha} className="flex items-start gap-3 text-sm">
              <GitCommitHorizontalIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <Link href={`/ledger/${item.ledger.owner}/${item.ledger.slug}/commit/${item.sha}`} className="block truncate hover:underline">
                  {item.subject}
                </Link>
                <div className="truncate text-xs text-muted-foreground">
                  {item.author.name} · {item.ledger.title} · {formatRelative(item.author.date)}
                </div>
              </div>
              <code className="shrink-0 font-mono text-[11px] text-muted-foreground">{item.shortSha}</code>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export default function LedgersPage() {
  const { data: me } = useMe();
  const ledgers = useLedgers(Boolean(me));
  const [creating, setCreating] = useState(false);
  const greeting = me ? `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${me.displayName || me.username}` : "Your ledgers";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Home"
        title={greeting}
        description="Every ledger is a git repository of plain-text files. Pick one to open its reports, journal and files."
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon data-icon="inline-start" /> New ledger
          </Button>
        }
      />
      {ledgers.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : ledgers.isError ? (
        <ErrorState error={ledgers.error} onRetry={() => void ledgers.refetch()} />
      ) : ledgers.data.length === 0 ? (
        <EmptyState
          title="No ledgers yet"
          description="Create your first ledger from a starter chart of accounts, a blank file, or the example dataset."
          action={
            <Button onClick={() => setCreating(true)}>
              <PlusIcon data-icon="inline-start" /> Create a ledger
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ledgers.data.map((ledger, i) => (
            <LedgerCard key={ledger.id} ledger={ledger} index={i} />
          ))}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,1.4fr)]">
        <Card variant="cream" className="animate-rise [animation-delay:120ms]">
          <CardContent className="space-y-3 text-sm">
            <h2 className="type-heading-sm">Good to know</h2>
            <ul className="space-y-2 text-muted-foreground">
              <li>Press <kbd className="rounded border bg-background px-1 font-mono text-xs">⌘K</kbd> inside a ledger to jump anywhere.</li>
              <li>Every edit becomes a commit — open History on any ledger to see diffs and roll things back by hand.</li>
              <li>Share a ledger from its Settings page; collaborators can be readers or writers.</li>
              <li className="flex items-center gap-1.5">
                <StarIcon className="size-3.5" /> Star public ledgers in the Gallery to find them again.
              </li>
            </ul>
          </CardContent>
        </Card>
        <Activity />
      </div>
      <NewLedgerDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
