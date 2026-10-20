"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ErrorState } from "@/components/app/states";
import { AuthCard, FormError } from "@/components/auth/auth-form";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/client";
import { useApproveDesktopSignIn, useMe } from "@/lib/api/hooks";

const CHALLENGE = /^[0-9a-f]{64}$/;
const DEEP_LINK = "beancount-studio://signed-in";

/**
 * The desktop app opened this page in the default browser. The app holds a secret and sent only
 * its hash (`challenge`); approving binds that hash to the signed-in account, after which the app
 * redeems its secret for a session. Visitors without a session cookie are sent to /login by the
 * proxy and come back here with the same query; the proxy cannot tell a live cookie from a stale
 * one, so a signed-out answer from the API is handled here the same way.
 */
function DesktopSignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const challenge = params.get("challenge") ?? "";
  const deepLink = params.get("deeplink") === "1";
  const { data: me, isPending, error, refetch } = useMe();
  const approve = useApproveDesktopSignIn();
  const [approved, setApproved] = useState(false);
  const appLink = `${DEEP_LINK}?challenge=${challenge}`;
  const signedOut = me === null;
  const loginHref = `/login?next=${encodeURIComponent(`/desktop/sign-in?${params.toString()}`)}`;

  useEffect(() => {
    if (signedOut) router.replace(loginHref);
  }, [signedOut, loginHref, router]);

  if (!CHALLENGE.test(challenge)) {
    return (
      <AuthCard title="This link is not valid" subtitle="Go back to Beancount Studio on your computer and start the sign-in again.">
        {null}
      </AuthCard>
    );
  }
  if (error) {
    return <ErrorState error={error} title="Couldn't check who is signed in" onRetry={() => void refetch()} />;
  }
  if (isPending || !me) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="size-5" />
      </div>
    );
  }
  if (approved) {
    return (
      <AuthCard title="You're signed in" subtitle="Return to Beancount Studio on your computer. It picks up the sign-in on its own.">
        {deepLink ? (
          <Button asChild size="lg" className="w-full">
            <a href={appLink}>Open Beancount Studio</a>
          </Button>
        ) : null}
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Sign in to the desktop app"
      subtitle={
        <>
          Beancount Studio on your computer wants to sign in as <strong className="text-foreground">{me.displayName || me.username}</strong> ({me.email}).
        </>
      }
      footer="Did not ask for this? Close this page. Nothing happens without your approval."
    >
      <div className="space-y-5">
        <p className="type-body text-muted-foreground">Only approve if you just started signing in from the app on this computer.</p>
        <FormError message={approve.error ? errorMessage(approve.error) : null} />
        <Button
          size="lg"
          className="w-full"
          disabled={approve.isPending}
          onClick={() =>
            approve.mutate(
              { challenge },
              {
                onSuccess: () => {
                  setApproved(true);
                  // The destination is the app's own URL scheme, not a Next.js route.
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                  if (deepLink) window.location.href = appLink;
                },
              },
            )
          }
        >
          {approve.isPending && <Spinner className="size-4" data-icon="inline-start" />}
          Approve
        </Button>
      </div>
    </AuthCard>
  );
}

export default function DesktopSignInPage() {
  return (
    <Suspense>
      <DesktopSignIn />
    </Suspense>
  );
}
