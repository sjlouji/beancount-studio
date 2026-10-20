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

export default function LedgerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ owner: string; slug: string }> }) {
  const { owner, slug } = use(params);
  const query = useLedger(owner, slug);

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
          <Link href={unauthorized ? `/login?next=/ledger/${owner}/${slug}` : "/ledgers"}>{unauthorized ? "Sign in" : "Back to ledgers"}</Link>
        </Button>
      </div>
    );
  }
  return (
    <LedgerShell owner={owner} slug={slug} ledger={query.data}>
      {children}
    </LedgerShell>
  );
}
