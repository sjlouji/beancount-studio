"use client";

import Link from "next/link";
import { use } from "react";
import { FrameSkeleton } from "@/components/app/app-frame";
import { Brand } from "@/components/app/brand";
import { ErrorState } from "@/components/app/states";
import { LedgerShell } from "@/components/ledger/ledger-shell";
import { Button } from "@/components/ui/button";
import { isApiError } from "@/lib/api/client";
import { useLedger } from "@/lib/api/hooks";
import { ledgerHref, workspaceHref } from "@/lib/routes";

export default function LedgerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspace: string; slug: string }> }) {
  const { workspace, slug } = use(params);
  const query = useLedger(workspace, slug);

  if (query.isPending) {
    return <FrameSkeleton />;
  }
  if (query.isError) {
    const unauthorized = isApiError(query.error, 401);
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
        <Brand />
        <ErrorState
          title={unauthorized ? "Sign in to view this ledger" : "Ledger not found"}
          error={query.error}
          onRetry={() => void query.refetch()}
          className="w-full max-w-md"
        />
        <Button asChild variant="outline">
          <Link href={unauthorized ? `/login?next=${encodeURIComponent(ledgerHref(workspace, slug))}` : workspaceHref(workspace)}>{unauthorized ? "Sign in" : "Back to the workspace"}</Link>
        </Button>
      </div>
    );
  }
  return (
    <LedgerShell workspace={workspace} slug={slug} ledger={query.data}>
      {children}
    </LedgerShell>
  );
}
