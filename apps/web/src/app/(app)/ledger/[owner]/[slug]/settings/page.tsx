"use client";

import { PageHeader } from "@/components/app/page-header";
import { CollaboratorsCard, LeaveCard } from "@/components/data/settings-collaborators";
import { DangerZone } from "@/components/data/settings-danger";
import { GeneralCard, VisibilityCard } from "@/components/data/settings-general";
import { RemoteCard } from "@/components/data/settings-remote";
import { ExportCard, OptionsCard } from "@/components/data/settings-options";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { useMe } from "@/lib/api/hooks";

export default function LedgerSettingsPage() {
  const { ledger, owner, slug } = useLedgerContext();
  const me = useMe();
  const isOwner = ledger.role === "owner";
  const canAdmin = ledger.canAdmin;
  // Public visitors have no membership to manage; everyone else with a non-admin role may leave.
  const canLeave = !isOwner && !canAdmin && (ledger.role === "read" || ledger.role === "write") && Boolean(me.data);

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader eyebrow="Settings" title="Ledger settings" description={`${owner}/${slug}`} className="mb-2" />
      {canAdmin && <GeneralCard key={`${ledger.slug}:${ledger.updatedAt}`} ledger={ledger} />}
      {isOwner && <VisibilityCard key={`${ledger.visibility}:${ledger.updatedAt}`} ledger={ledger} />}
      <RemoteCard ledger={ledger} />
      {canAdmin && <CollaboratorsCard ledger={ledger} />}
      {canLeave && me.data && <LeaveCard ledger={ledger} username={me.data.username} />}
      <ExportCard owner={owner} slug={slug} />
      <OptionsCard owner={owner} slug={slug} />
      {isOwner && <DangerZone ledger={ledger} />}
    </div>
  );
}
