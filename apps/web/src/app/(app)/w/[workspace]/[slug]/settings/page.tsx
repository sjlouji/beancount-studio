"use client";

import { PageHeader } from "@/components/app/page-header";
import { DangerZone } from "@/components/data/settings-danger";
import { GeneralCard, VisibilityCard } from "@/components/data/settings-general";
import { RemoteCard } from "@/components/data/settings-remote";
import { ExportCard, OptionsCard } from "@/components/data/settings-options";
import { useLedgerContext } from "@/components/ledger/ledger-context";

export default function LedgerSettingsPage() {
  const { ledger, workspace, slug } = useLedgerContext();
  // Who may change or delete a ledger follows from their role in its workspace.
  const canAdmin = ledger.canAdmin;

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader eyebrow="Settings" title="Ledger settings" description={`${workspace}/${slug}`} className="mb-2" />
      {canAdmin && <GeneralCard key={`${ledger.slug}:${ledger.updatedAt}`} ledger={ledger} />}
      {canAdmin && <VisibilityCard key={`${ledger.visibility}:${ledger.updatedAt}`} ledger={ledger} />}
      <RemoteCard ledger={ledger} />
      <ExportCard workspace={workspace} slug={slug} />
      <OptionsCard workspace={workspace} slug={slug} />
      {canAdmin && <DangerZone ledger={ledger} />}
    </div>
  );
}
