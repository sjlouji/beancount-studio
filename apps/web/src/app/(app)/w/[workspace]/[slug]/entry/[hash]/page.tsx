"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { ErrorState, LoadingState } from "@/components/app/states";
import { EntryEditor } from "@/components/ledger/entry-context-sheet";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { useEntryContext } from "@/lib/api/hooks";

export default function EntryPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = use(params);
  const { workspace, slug, base } = useLedgerContext();
  const router = useRouter();
  const query = useEntryContext(workspace, slug, hash);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Entry" title={query.data?.entry.type ?? "Entry"} description={<span className="font-mono text-xs">{hash}</span>} />
      {query.isPending ? <LoadingState /> : query.isError ? <ErrorState title="Entry not found" error={query.error} onRetry={() => void query.refetch()} /> : <EntryEditor context={query.data} onDeleted={() => router.push(`${base}/journal`)} />}
    </div>
  );
}
