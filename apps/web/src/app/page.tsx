"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FocusShell } from "@/components/app/focus-shell";
import { ErrorState, LoadingState } from "@/components/app/states";
import { pickWorkspace } from "@/components/workspace/use-current-workspace";
import { useMe, useWorkspaces } from "@/lib/api/hooks";
import { workspaceHref } from "@/lib/routes";

/** `/` opens the workspace used last (or the first), and onboarding when there is none yet. */
export default function RootPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const workspaces = useWorkspaces(Boolean(me));

  useEffect(() => {
    if (me === null) {
      router.replace("/login");
      return;
    }
    if (!workspaces.data) return;
    const target = pickWorkspace(workspaces.data);
    router.replace(target ? workspaceHref(target.slug) : "/new");
  }, [me, workspaces.data, router]);

  if (workspaces.isError) {
    return (
      <FocusShell>
        <ErrorState error={workspaces.error} title="Couldn't load your workspaces" onRetry={() => void workspaces.refetch()} />
      </FocusShell>
    );
  }
  return <LoadingState label="Opening your workspace…" className="min-h-dvh" />;
}
