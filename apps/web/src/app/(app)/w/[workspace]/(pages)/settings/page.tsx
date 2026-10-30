"use client";

import { PageHeader } from "@/components/app/page-header";
import { InviteLinksCard } from "@/components/workspace/invite-links";
import { MembersCard } from "@/components/workspace/members-card";
import { canAdminister } from "@/components/workspace/rules";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import { DangerCard, GeneralCard, LeaveCard } from "@/components/workspace/workspace-settings-cards";
import { useMembers } from "@/lib/api/hooks";
import type { Workspace } from "@/lib/api/types";

function WorkspaceSettings({ workspace }: { workspace: Workspace }) {
  const members = useMembers(workspace.slug);
  const admin = canAdminister(workspace.role);

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader eyebrow="Workspace" title="Workspace settings" description={`${workspace.name} · /w/${workspace.slug}`} className="mb-2" />
      {admin && <GeneralCard key={`${workspace.slug}:${workspace.updatedAt}`} workspace={workspace} />}
      <MembersCard workspace={workspace} members={members} index={1} />
      {admin && <InviteLinksCard workspace={workspace} index={2} />}
      <LeaveCard workspace={workspace} members={members.data ?? []} index={3} />
      {workspace.role === "owner" && <DangerCard workspace={workspace} index={4} />}
    </div>
  );
}

export default function WorkspaceSettingsPage() {
  return <WorkspaceGate>{(workspace) => <WorkspaceSettings workspace={workspace} />}</WorkspaceGate>;
}
