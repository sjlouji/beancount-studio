"use client";

import { CalendarIcon, GlobeIcon, LockIcon, MapPinIcon, PencilIcon, StarIcon } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { initialsOf } from "@/components/app/user-menu";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isApiError } from "@/lib/api/client";
import { useProfile } from "@/lib/api/hooks";
import type { PublicProfile } from "@/lib/api/types";
import { formatDate, formatRelative } from "@/lib/format";

type ProfileLedger = PublicProfile["ledgers"][number];

function externalHref(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

function LedgerCard({ ledger, index }: { ledger: ProfileLedger; index: number }) {
  return (
    <Link href={`/ledger/${ledger.owner}/${ledger.slug}`} className="group block animate-rise outline-none" style={{ animationDelay: `${index * 40}ms` }}>
      <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-float group-focus-visible:ring-3 group-focus-visible:ring-ring/50">
        <CardContent className="flex h-full flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate font-medium">{ledger.title}</h3>
            {ledger.visibility === "private" ? (
              <Badge variant="secondary">
                <LockIcon /> Private
              </Badge>
            ) : (
              <Badge variant="outline">Public</Badge>
            )}
          </div>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {ledger.owner}/{ledger.slug}
          </p>
          {ledger.description && <p className="line-clamp-2 text-sm text-muted-foreground">{ledger.description}</p>}
          <div className="mt-auto flex items-center justify-between gap-3 pt-2 text-xs text-muted-foreground">
            <span>Updated {formatRelative(ledger.updatedAt)}</span>
            <span className="tabular flex items-center gap-1">
              <StarIcon className="size-3.5" /> {ledger.starsCount}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const profile = useProfile(decodeURIComponent(username));

  if (profile.isPending) {
    return (
      <div className="space-y-8">
        <CardSkeleton rows={3} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }
  if (profile.isError) {
    return isApiError(profile.error, 404) ? (
      <ErrorState error={profile.error} title="User not found" />
    ) : (
      <ErrorState error={profile.error} title="Couldn't load this profile" onRetry={() => void profile.refetch()} />
    );
  }

  const { profile: user, ledgers, starredCount, isSelf } = profile.data;
  const name = user.displayName || user.username;
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar className="size-20 animate-rise">
          <AvatarFallback className="bg-primary/15 text-2xl font-semibold text-primary">{initialsOf(name)}</AvatarFallback>
        </Avatar>
        <PageHeader
          className="min-w-0 flex-1"
          title={name}
          actions={
            isSelf && (
              <Button asChild variant="outline" size="sm">
                <Link href="/settings">
                  <PencilIcon data-icon="inline-start" /> Edit profile
                </Link>
              </Button>
            )
          }
        >
          <p className="mt-2 font-mono text-sm text-muted-foreground">@{user.username}</p>
          {user.bio && <p className="mt-3 max-w-2xl text-sm whitespace-pre-line">{user.bio}</p>}
          <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            {user.location && (
              <li className="flex items-center gap-1.5">
                <MapPinIcon className="size-3.5" /> {user.location}
              </li>
            )}
            {user.website && (
              <li className="flex min-w-0 items-center gap-1.5">
                <GlobeIcon className="size-3.5 shrink-0" />
                <a href={externalHref(user.website)} target="_blank" rel="noopener noreferrer nofollow" className="truncate hover:text-foreground hover:underline">
                  {user.website.replace(/^https?:\/\//i, "")}
                </a>
              </li>
            )}
            <li className="flex items-center gap-1.5">
              <CalendarIcon className="size-3.5" /> Joined {formatDate(user.createdAt)}
            </li>
            <li className="tabular flex items-center gap-1.5">
              <StarIcon className="size-3.5" /> {starredCount} starred
            </li>
          </ul>
        </PageHeader>
      </div>
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Ledgers</h2>
        {ledgers.length === 0 ? (
          <EmptyState
            title="No ledgers to show"
            description={isSelf ? "You haven't created any ledgers yet. Create one from the Ledgers page." : `${name} hasn't shared any public ledgers.`}
            action={
              isSelf ? (
                <Button asChild size="sm">
                  <Link href="/ledgers">Go to ledgers</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ledgers.map((ledger, i) => (
              <LedgerCard key={`${ledger.owner}/${ledger.slug}`} ledger={ledger} index={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
