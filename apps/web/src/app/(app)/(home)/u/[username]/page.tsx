"use client";

import { CalendarIcon, GlobeIcon, MapPinIcon, PencilIcon, StarIcon } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { initialsOf } from "@/components/app/user-menu";
import { PageHeader } from "@/components/app/page-header";
import { CardSkeleton, ErrorState } from "@/components/app/states";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { isApiError } from "@/lib/api/client";
import { useProfile } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";

function externalHref(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

export default function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const profile = useProfile(decodeURIComponent(username));

  if (profile.isPending) {
    return <CardSkeleton rows={3} />;
  }
  if (profile.isError) {
    return isApiError(profile.error, 404) ? (
      <ErrorState error={profile.error} title="User not found" />
    ) : (
      <ErrorState error={profile.error} title="Couldn't load this profile" onRetry={() => void profile.refetch()} />
    );
  }

  const { profile: user, starredCount, isSelf } = profile.data;
  const name = user.displayName || user.username;
  return (
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
  );
}
