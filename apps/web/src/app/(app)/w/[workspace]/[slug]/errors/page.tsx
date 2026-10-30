"use client";

import { CircleCheckBigIcon } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLedgerErrors } from "@/lib/api/hooks";
import { pluralize } from "@/lib/format";

export default function ErrorsPage() {
  const { workspace, slug, base } = useLedgerContext();
  const errors = useLedgerErrors(workspace, slug);

  if (errors.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Errors" title="Ledger errors" />
        <CardSkeleton rows={4} />
      </div>
    );
  }
  if (errors.isError) return <ErrorState error={errors.error} onRetry={() => void errors.refetch()} />;
  const list = errors.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Errors"
        title={list.length === 0 ? "No ledger errors" : `${list.length} ledger ${pluralize(list.length, "error")}`}
        description="Problems found when parsing and validating the ledger, the same checks `bean-check` runs."
      />
      {list.length === 0 ? (
        <EmptyState
          icon={<CircleCheckBigIcon className="text-positive" />}
          title="bean-check passes"
          description="Every directive parses, every balance assertion holds, and every transaction balances. Nothing to fix."
          action={
            <Button asChild variant="outline">
              <Link href={`${base}/journal`}>Go to the journal</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {list.map((error, index) => (
            <li key={`${error.filename}:${error.lineno}:${index}`} className="animate-rise rounded-xl border border-negative/30 bg-card p-4" style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="destructive">{error.type}</Badge>
                {error.filename && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {error.filename}
                    {error.lineno ? `:${error.lineno}` : ""}
                  </span>
                )}
                {error.filename && (
                  <Button asChild variant="outline" size="xs" className="ml-auto">
                    <Link href={`${base}/files/edit?path=${encodeURIComponent(error.filename)}${error.lineno ? `&line=${error.lineno}` : ""}`}>Open in editor</Link>
                  </Button>
                )}
              </div>
              <p className="mt-2 font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap">{error.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
