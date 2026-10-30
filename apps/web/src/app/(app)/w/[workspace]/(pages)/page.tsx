"use client";

import { GitCommitHorizontalIcon, PlusIcon, UserPlusIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState, ListSkeleton } from "@/components/app/states";
import { UserAvatar } from "@/components/app/user-menu";
import { NewLedgerDialog } from "@/components/ledger/new-ledger-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LedgerCard } from "@/components/workspace/ledger-card";
import { ROLE_LABELS, canAdminister, canWrite } from "@/components/workspace/rules";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import { useActivity, useMembers, useWorkspaceLedgers } from "@/lib/api/hooks";
import type { Workspace } from "@/lib/api/types";
import { formatRelative } from "@/lib/format";
import { ledgerHref, workspaceHref } from "@/lib/routes";

function count(n: number, noun: string): string {
  return `${n} ${n === 1 ? noun : `${noun}s`}`;
}

function People({ workspace }: { workspace: Workspace }) {
  const members = useMembers(workspace.slug);
  return (
    <Card variant="muted" className="animate-rise [animation-delay:120ms]">
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="type-headline">People</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href={`${workspaceHref(workspace.slug)}/settings#members`}>{canAdminister(workspace.role) ? "Manage" : "See all"}</Link>
          </Button>
        </div>
        {members.isPending ? (
          <ListSkeleton rows={3} className="border-0 bg-transparent" />
        ) : members.isError ? (
          <ErrorState error={members.error} onRetry={() => void members.refetch()} />
        ) : (
          <ul className="space-y-2">
            {members.data.slice(0, 6).map((person) => (
              <li key={person.username} className="flex items-center gap-2.5 text-sm">
                <UserAvatar name={person.displayName || person.username} className="size-6" />
                <span className="min-w-0 flex-1 truncate">{person.displayName || person.username}</span>
                <Badge variant="secondary">{ROLE_LABELS[person.role]}</Badge>
              </li>
            ))}
            {members.data.length > 6 && <li className="type-footnote text-muted-foreground">and {members.data.length - 6} more</li>}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Activity({ workspace }: { workspace: Workspace }) {
  const activity = useActivity(15, workspace.slug);
  if (activity.isPending) return <CardSkeleton rows={6} />;
  if (activity.isError) return <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />;
  if (activity.data.items.length === 0) return null;
  return (
    <Card className="animate-rise [animation-delay:160ms]">
      <CardContent>
        <h2 className="mb-3 type-headline">Recent activity</h2>
        <ol className="space-y-2.5">
          {activity.data.items.map((item) => (
            <li key={item.sha} className="flex items-start gap-3 text-sm">
              <GitCommitHorizontalIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <Link href={`${ledgerHref(item.ledger.workspace, item.ledger.slug)}/commit/${item.sha}`} className="block truncate hover:underline">
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

function WorkspaceHome({ workspace }: { workspace: Workspace }) {
  const ledgers = useWorkspaceLedgers(workspace.slug);
  const [creating, setCreating] = useState(false);
  const writer = canWrite(workspace.role);
  const admin = canAdminister(workspace.role);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title={workspace.name}
        description={`${count(workspace.membersCount, "member")} · ${count(workspace.ledgersCount, "ledger")}. Every ledger is a git repository of plain-text files; pick one to open its reports, journal and files.`}
        actions={
          <>
            {admin && (
              <Button asChild variant="outline">
                <Link href={`${workspaceHref(workspace.slug)}/settings#invites`}>
                  <UserPlusIcon data-icon="inline-start" /> Invite people
                </Link>
              </Button>
            )}
            {writer && (
              <Button onClick={() => setCreating(true)}>
                <PlusIcon data-icon="inline-start" /> New ledger
              </Button>
            )}
          </>
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
          description={writer ? "Create the first one from a starter chart of accounts, a blank file or the example dataset, or import a repository." : "Nobody has added a ledger to this workspace yet."}
          action={
            writer ? (
              <Button onClick={() => setCreating(true)}>
                <PlusIcon data-icon="inline-start" /> Create a ledger
              </Button>
            ) : undefined
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
        <People workspace={workspace} />
        <Activity workspace={workspace} />
      </div>
      {writer && <NewLedgerDialog open={creating} onOpenChange={setCreating} />}
    </div>
  );
}

export default function WorkspaceHomePage() {
  return <WorkspaceGate>{(workspace) => <WorkspaceHome workspace={workspace} />}</WorkspaceGate>;
}
