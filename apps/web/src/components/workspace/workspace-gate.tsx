"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ErrorState, PageSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/api/hooks";
import type { Workspace } from "@/lib/api/types";
import { useCurrentWorkspace } from "./use-current-workspace";

/**
 * Renders a workspace page only once the workspace in the URL is known to be one of the person's;
 * shows the sign-in, loading, error and not-a-member states otherwise.
 */
export function WorkspaceGate({ children }: { children: (workspace: Workspace) => ReactNode }) {
  const { data: me } = useMe();
  const { slug, workspace, workspaces } = useCurrentWorkspace();

  if (me === null) {
    return (
      <div className="space-y-6">
        <ErrorState error={new Error("Workspaces are visible to their members.")} title="Sign in to view this workspace" />
        <Button asChild>
          <Link href={`/login?next=/w/${encodeURIComponent(slug)}`}>Sign in</Link>
        </Button>
      </div>
    );
  }
  if (me === undefined || workspaces.isPending) return <PageSkeleton cards={3} />;
  if (workspaces.isError) return <ErrorState error={workspaces.error} title="Couldn't load your workspaces" onRetry={() => void workspaces.refetch()} />;
  if (!workspace) {
    return (
      <div className="space-y-6">
        <ErrorState error={new Error(`There is no workspace at /w/${slug} that you belong to.`)} title="Workspace not found" />
        <Button asChild variant="outline">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    );
  }
  return <>{children(workspace)}</>;
}
