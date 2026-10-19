"use client";

import { SearchIcon, StarIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { Card, CardContent } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { useGallery, useMe, useSystemInfo } from "@/lib/api/hooks";
import { formatRelative } from "@/lib/format";

export default function GalleryPage() {
  const [q, setQ] = useState("");
  const gallery = useGallery(q.trim() || undefined);
  const { data: me } = useMe();
  const { data: info } = useSystemInfo();
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Explore" title="Public ledgers" description="Ledgers their owners chose to share. Open any of them read-only, star the ones you like." />
      <InputGroup className="max-w-md">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput placeholder="Search by title or description" value={q} onChange={(e) => setQ(e.target.value)} />
      </InputGroup>
      {gallery.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : gallery.isError ? (
        <ErrorState error={gallery.error} onRetry={() => void gallery.refetch()} />
      ) : gallery.data.length === 0 ? (
        <EmptyState title="No public ledgers" description="Make one of yours public from its Settings page to see it here." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {gallery.data.map((ledger, i) => (
            <Link key={ledger.id} href={`/ledger/${ledger.owner}/${ledger.slug}`} className="group block animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
              <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40">
                <CardContent className="flex h-full flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate font-medium">{ledger.title}</h3>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <StarIcon className="size-3.5" /> {ledger.starsCount}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {ledger.owner}/{ledger.slug}
                  </p>
                  {ledger.description && <p className="line-clamp-3 text-sm text-muted-foreground">{ledger.description}</p>}
                  <p className="mt-auto pt-2 text-xs text-muted-foreground">Updated {formatRelative(ledger.updatedAt)}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Card variant="aubergine" className="animate-rise [animation-delay:120ms]">
        <CardContent className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="type-display-md text-balance">Keep your own books here.</h2>
            <p className="mt-3 type-body-md text-sidebar-muted">
              Beancount Studio is self-hosted: your ledger is a git repository you own, with reports, imports, receipts and an assistant that asks before it writes.
            </p>
          </div>
          <Button asChild size="lg" variant="outline-on-aubergine">
            <Link href={me ? "/ledgers" : info?.signupEnabled ? "/sign-up" : "/login"}>{me ? "Open my ledgers" : info?.signupEnabled ? "Create an account" : "Sign in"}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
