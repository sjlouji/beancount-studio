"use client";

import { UsersIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";
import { toast } from "sonner";
import { FocusShell } from "@/components/app/focus-shell";
import { CardSkeleton, ErrorState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ROLE_LABELS, ROLE_OPTIONS } from "@/components/workspace/rules";
import { errorMessage, isApiError } from "@/lib/api/client";
import { useAcceptInvite, useInvitePreview, useMe } from "@/lib/api/hooks";
import { appLink, useHost } from "@/lib/desktop";
import { formatDate } from "@/lib/format";
import { rememberWorkspace, workspaceHref } from "@/lib/routes";

/** An invite link lands here: what it offers, then sign in or join. Public, since the link is the secret. */
export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { data: me } = useMe();
  const preview = useInvitePreview(token);
  const accept = useAcceptInvite(token);
  const host = useHost();
  const here = `/invite/${encodeURIComponent(token)}`;

  if (preview.isPending || me === undefined) {
    return (
      <FocusShell>
        <CardSkeleton rows={3} />
      </FocusShell>
    );
  }
  if (preview.isError) {
    return (
      <FocusShell>
        {isApiError(preview.error, 404) ? (
          <ErrorState error={preview.error} title="This invite link doesn't work" />
        ) : (
          <ErrorState error={preview.error} title="Couldn't read this invite" onRetry={() => void preview.refetch()} />
        )}
        <Button asChild variant="outline" className="mt-6">
          <Link href="/">Go home</Link>
        </Button>
      </FocusShell>
    );
  }

  const invite = preview.data;
  const role = ROLE_OPTIONS.find((option) => option.value === invite.role);
  const open = () => {
    rememberWorkspace(invite.workspaceSlug);
    router.replace(workspaceHref(invite.workspaceSlug));
  };

  return (
    <FocusShell>
      <Card>
        <CardContent className="space-y-6">
          <div className="flex size-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
            <UsersIcon className="size-6" />
          </div>
          <div>
            <p className="type-caption-2 text-muted-foreground">Invitation</p>
            <h1 className="mt-1.5 type-title-1">Join {invite.workspaceName}</h1>
            <p className="mt-2 type-body text-muted-foreground">
              {invite.invitedBy ? `${invite.invitedBy} invited you` : "You were invited"} to join as {ROLE_LABELS[invite.role].toLowerCase()}
              {role ? `: ${role.hint.charAt(0).toLowerCase()}${role.hint.slice(1)}.` : "."} The link works until {formatDate(invite.expiresAt)}.
            </p>
          </div>
          {me === null ? (
            <div className="flex flex-col gap-2">
              <Button asChild size="lg">
                <Link href={`/login?next=${encodeURIComponent(here)}`}>Sign in to join</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href={`/sign-up?next=${encodeURIComponent(here)}`}>Create an account</Link>
              </Button>
            </div>
          ) : invite.alreadyMember ? (
            <div className="space-y-3">
              <p className="type-subhead text-muted-foreground">You are already a member of this workspace.</p>
              <Button size="lg" className="w-full" onClick={open}>
                Open {invite.workspaceName}
              </Button>
            </div>
          ) : (
            <Button
              size="lg"
              className="w-full"
              disabled={accept.isPending}
              onClick={() =>
                accept.mutate(undefined, {
                  onSuccess: (workspace) => {
                    toast.success(`Welcome to ${workspace.name}`);
                    open();
                  },
                  onError: (error) => toast.error(errorMessage(error, "Couldn't join the workspace")),
                })
              }
            >
              {accept.isPending && <Spinner className="size-4" data-icon="inline-start" />}
              Join as {me.displayName || me.username}
            </Button>
          )}
          {host === "browser" && (
            <p className="type-footnote text-muted-foreground">
              Have the Mac app?{" "}
              <a href={appLink(here)} className="link">
                Open this invitation in Beancount Studio
              </a>
              .
            </p>
          )}
        </CardContent>
      </Card>
    </FocusShell>
  );
}
