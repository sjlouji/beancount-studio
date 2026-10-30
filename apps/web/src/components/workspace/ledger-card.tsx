"use client";

import { GitCommitHorizontalIcon, LockIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Ledger } from "@/lib/api/types";
import { formatRelative } from "@/lib/format";
import { ledgerHref } from "@/lib/routes";

/** One ledger in a workspace's grid: title, address, description and the latest commit. */
export function LedgerCard({ ledger, index }: { ledger: Ledger; index: number }) {
  return (
    <Link href={ledgerHref(ledger.workspace, ledger.slug)} className="group block animate-rise outline-none" style={{ animationDelay: `${index * 40}ms` }}>
      <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-focus-visible:ring-3 group-focus-visible:ring-ring/50">
        <CardContent className="flex h-full flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-lg font-bold text-primary">{ledger.title.slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate font-medium">{ledger.title}</h3>
                {ledger.visibility === "private" ? <LockIcon className="size-3.5 text-muted-foreground" /> : <Badge variant="outline">Public</Badge>}
              </div>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {ledger.workspace}/{ledger.slug}
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
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
