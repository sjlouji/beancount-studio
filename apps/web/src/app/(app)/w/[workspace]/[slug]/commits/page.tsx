"use client";

import { GitCommitHorizontalIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCommits } from "@/lib/api/hooks";
import { formatDate, formatRelative } from "@/lib/format";

const PAGE_SIZE = 30;

export default function CommitsPage() {
  const { workspace, slug, base } = useLedgerContext();
  const router = useRouter();
  const search = useSearchParams();
  const path = search.get("path") || undefined;
  const pageParam = Number(search.get("page"));
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const commits = useCommits(workspace, slug, page, PAGE_SIZE, path);

  function goTo(nextPage: number, nextPath = path) {
    const params = new URLSearchParams();
    if (nextPath) params.set("path", nextPath);
    if (nextPage > 1) params.set("page", String(nextPage));
    const query = params.toString();
    router.push(`${base}/commits${query ? `?${query}` : ""}`, { scroll: false });
  }

  const header = (
    <PageHeader
      eyebrow="History"
      title="Commits"
      description="Every change to this ledger is a git commit: edits, imports, and entries added from the journal."
      actions={
        path ? (
          <Badge variant="secondary" className="h-7 gap-1.5 pl-2.5 pr-1 font-mono text-[12px]">
            {path}
            <Button variant="ghost" size="icon-xs" aria-label="Clear path filter" onClick={() => goTo(1, undefined)}>
              <XIcon />
            </Button>
          </Badge>
        ) : undefined
      }
    />
  );

  if (commits.isPending) {
    return (
      <div className="space-y-6">
        {header}
        <CardSkeleton rows={8} />
      </div>
    );
  }
  if (commits.isError) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState error={commits.error} onRetry={() => void commits.refetch()} />
      </div>
    );
  }

  const { commits: items, total } = commits.data;
  // `total` counts every commit in the repo, so with a path filter it is only an upper bound:
  // paging is driven by whether a full page came back.
  const hasNext = path ? items.length === PAGE_SIZE : page * PAGE_SIZE < total;
  const first = items.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = (page - 1) * PAGE_SIZE + items.length;

  return (
    <div className="space-y-6">
      {header}

      {items.length === 0 ? (
        <EmptyState
          icon={<GitCommitHorizontalIcon />}
          title={path ? "No commits touch this path" : "No commits yet"}
          description={path ? "The path may be new, renamed, or mistyped." : "Edit a file or add an entry and it will show up here."}
          action={
            path ? (
              <Button size="sm" variant="outline" onClick={() => goTo(1, undefined)}>
                Show all commits
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href={`${base}/files`}>Browse files</Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <ol className="animate-rise divide-y overflow-hidden rounded-xl border bg-card [animation-delay:80ms]">
            {items.map((commit) => (
              <li key={commit.sha}>
                <Link href={`${base}/commit/${commit.sha}`} className="flex items-center gap-4 px-4 py-3 outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60">
                  <code className="shrink-0 rounded-md bg-surface px-1.5 py-0.5 font-mono text-[12px] text-muted-foreground">{commit.shortSha}</code>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{commit.subject}</span>
                  <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">{commit.author.name}</span>
                  <time dateTime={commit.author.date} title={formatDate(commit.author.date, { dateStyle: "medium", timeStyle: "short" })} className="tabular w-28 shrink-0 text-right text-xs text-muted-foreground">
                    {formatRelative(commit.author.date)}
                  </time>
                </Link>
              </li>
            ))}
          </ol>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="tabular">
              {first.toLocaleString()}–{last.toLocaleString()}
              {!path && ` of ${total.toLocaleString()}`}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goTo(page - 1)}>
                Newer
              </Button>
              <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => goTo(page + 1)}>
                Older
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
