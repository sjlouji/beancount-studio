"use client";

import { ExternalLinkIcon, GitCommitHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { use, useMemo } from "react";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { editorHref } from "@/components/files/file-dialogs";
import { DiffView } from "@/components/ledger/diff-view";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCommit } from "@/lib/api/hooks";
import { formatDate, formatRelative, pluralize } from "@/lib/format";

const AUTO_OPEN_LIMIT = 10;

interface FileDiff {
  path: string;
  diff: string;
}

/** Split a multi-file `git show` patch into one unified diff per file. */
function splitDiff(diff: string): FileDiff[] {
  const sections = diff.split(/^(?=diff --git )/m).filter((s) => s.startsWith("diff --git "));
  return sections.map((section) => {
    const added = section.match(/^\+\+\+ b\/(.+)$/m)?.[1];
    const removed = section.match(/^--- a\/(.+)$/m)?.[1];
    const header = section.match(/^diff --git a\/(.+?) b\/(.+)$/m)?.[2];
    return { path: added ?? removed ?? header ?? "unknown", diff: section.replace(/\n$/, "") };
  });
}

const STATUS_LABEL: Record<string, string> = { A: "added", M: "modified", D: "deleted", R: "renamed" };

export default function CommitPage({ params }: { params: Promise<{ sha: string }> }) {
  const { sha } = use(params);
  const { workspace, slug, base } = useLedgerContext();
  const commit = useCommit(workspace, slug, sha);
  const diffs = useMemo(() => splitDiff(commit.data?.diff ?? ""), [commit.data]);

  if (commit.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Commit" title={<span className="font-mono text-2xl">{sha.slice(0, 7)}</span>} />
        <CardSkeleton rows={3} />
        <CardSkeleton rows={8} />
      </div>
    );
  }
  if (commit.isError) return <ErrorState error={commit.error} onRetry={() => void commit.refetch()} title="Couldn't load this commit" />;

  const data = commit.data;
  const body = data.message.startsWith(data.subject) ? data.message.slice(data.subject.length).trim() : "";
  const statusByPath = new Map(data.files.map((f) => [f.filename, f.status]));
  const anchor = (index: number) => `file-${index}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link href={`${base}/commits`} className="hover:text-foreground">
            Commits
          </Link>
        }
        title={data.subject}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href={`${base}/commits`}>All commits</Link>
          </Button>
        }
      />

      <div className="animate-rise rounded-xl border bg-card p-5 [animation-delay:80ms]">
        {body && <p className="mb-4 whitespace-pre-wrap text-sm text-muted-foreground">{body}</p>}
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Commit</dt>
            <dd className="mt-0.5 break-all font-mono text-[12px]">{data.sha}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Author</dt>
            <dd className="mt-0.5">{data.author.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Date</dt>
            <dd className="mt-0.5" title={formatDate(data.author.date, { dateStyle: "full", timeStyle: "medium" })}>
              {formatDate(data.author.date, { dateStyle: "medium", timeStyle: "short" })} <span className="text-muted-foreground">· {formatRelative(data.author.date)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{data.parents.length === 1 ? "Parent" : "Parents"}</dt>
            <dd className="mt-0.5 flex flex-wrap gap-2">
              {data.parents.length === 0 ? (
                <span className="text-muted-foreground">Root commit</span>
              ) : (
                data.parents.map((parent) => (
                  <Link key={parent} href={`${base}/commit/${parent}`} className="font-mono text-[12px] underline-offset-4 hover:underline">
                    {parent.slice(0, 7)}
                  </Link>
                ))
              )}
            </dd>
          </div>
        </dl>
      </div>

      {data.files.length === 0 ? (
        <EmptyState icon={<GitCommitHorizontalIcon />} title="This commit changed no files" description="Empty commits only record a message." />
      ) : (
        <>
          <section aria-labelledby="changed-files" className="animate-rise rounded-xl border bg-card [animation-delay:120ms]">
            <div className="flex flex-wrap items-baseline gap-x-3 border-b px-4 py-2.5">
              <h2 id="changed-files" className="text-sm font-medium">
                {pluralize(data.files.length, "file")} changed
              </h2>
              <span className="tabular text-xs">
                <span className="text-positive">+{data.stats.additions}</span> <span className="text-negative">−{data.stats.deletions}</span>
              </span>
            </div>
            <ul className="divide-y">
              {data.files.map((file, index) => (
                <li key={file.filename} className="flex items-center gap-3 px-4 py-1.5 text-sm">
                  <a href={`#${anchor(index)}`} className="min-w-0 flex-1 truncate font-mono text-[13px] hover:underline">
                    {file.filename}
                  </a>
                  <Badge variant="outline" className="hidden sm:inline-flex">
                    {STATUS_LABEL[file.status] ?? file.status}
                  </Badge>
                  <span className="tabular flex w-24 shrink-0 justify-end gap-2 text-xs">
                    <span className="text-positive">+{file.additions}</span>
                    <span className="text-negative">−{file.deletions}</span>
                  </span>
                  {file.status !== "D" ? (
                    <Button asChild variant="ghost" size="icon-xs" aria-label={`Open current ${file.filename}`}>
                      <Link href={editorHref(base, file.filename)}>
                        <ExternalLinkIcon />
                      </Link>
                    </Button>
                  ) : (
                    <span className="size-6" aria-hidden />
                  )}
                </li>
              ))}
            </ul>
          </section>

          <div className="space-y-4">
            {diffs.map((item, index) => (
              <div key={`${item.path}-${index}`} id={anchor(index)} className="scroll-mt-28 animate-rise" style={{ animationDelay: `${160 + Math.min(index, 5) * 40}ms` }}>
                <DiffView path={item.path} diff={item.diff} defaultOpen={diffs.length <= AUTO_OPEN_LIMIT} />
                {statusByPath.get(item.path) !== "D" && (
                  <div className="mt-1 text-right">
                    <Link href={editorHref(base, item.path)} className="text-xs text-muted-foreground hover:text-foreground">
                      Open current file <ExternalLinkIcon className="inline size-3" />
                    </Link>
                  </div>
                )}
              </div>
            ))}
            {diffs.length === 0 && <p className="text-sm text-muted-foreground">No textual diff is available (binary or empty changes).</p>}
          </div>
        </>
      )}
    </div>
  );
}
