"use client";

import { KeyRoundIcon, PlusIcon } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/app/states";
import { CopyButton } from "@/components/settings/copy-button";
import { CreateApiKeyDialog } from "@/components/settings/create-api-key-dialog";
import { SettingsCard } from "@/components/settings/settings-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { errorMessage } from "@/lib/api/client";
import { useApiKeys, useLedgers, useMe, useRevokeApiKey } from "@/lib/api/hooks";
import type { ApiKey, Ledger } from "@/lib/api/types";
import { formatDate, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

function isExpired(key: ApiKey): boolean {
  return key.expiresAt !== null && new Date(key.expiresAt).getTime() < Date.now();
}

function Usage() {
  const { data: me } = useMe();
  const ledgers = useLedgers(Boolean(me));
  // The origin is only known in the browser; fall back to a placeholder for the server render.
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "https://your-host");
  const example = ledgers.data?.[0];
  const workspace = example?.workspace ?? "{workspace}";
  const slug = example?.slug ?? "{slug}";
  const curl = `curl -H "Authorization: Bearer bsk_…" \\\n  "${origin}/api/workspaces/${workspace}/ledgers/${slug}/query?q=SELECT%20account,%20sum(position)%20GROUP%20BY%20account"`;
  return (
    <SettingsCard
      title="Using API keys"
      index={0}
      description={
        <>
          Send a key as <code className="font-mono text-[13px]">Authorization: Bearer bsk_…</code>. Keys can read and, if you allow it, write ledgers, but they can&apos;t create other keys or change your account.
        </>
      }
    >
      <div className="relative rounded-lg border bg-surface">
        <pre className="overflow-x-auto p-3 pr-24 font-mono text-[13px] leading-relaxed">{curl}</pre>
        <CopyButton value={curl.replace(" \\\n ", "")} className="absolute top-2 right-2" />
      </div>
    </SettingsCard>
  );
}

function ScopeBadges({ scopes }: { scopes: string[] }) {
  return (
    <>
      {scopes.map((scope) => (
        <Badge key={scope} variant={scope === "write" ? "secondary" : "outline"}>
          {scope}
        </Badge>
      ))}
    </>
  );
}

function KeyRow({ apiKey, ledger, index, onRevoke }: { apiKey: ApiKey; ledger: Ledger | undefined; index: number; onRevoke: () => void }) {
  const revoked = apiKey.revokedAt !== null;
  const expired = !revoked && isExpired(apiKey);
  const inactive = revoked || expired;
  const ledgerLabel = apiKey.ledgerId === null ? "All ledgers" : (ledger?.title ?? "Unavailable ledger");
  return (
    <Card className={cn("animate-rise", inactive && "bg-muted/40")} style={{ animationDelay: `${index * 40}ms` }}>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className={cn("flex min-w-0 flex-1 items-start gap-3", inactive && "text-muted-foreground")}>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <KeyRoundIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={cn("truncate font-medium", !inactive && "text-foreground", revoked && "line-through")}>{apiKey.name}</h3>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{apiKey.keyPrefix}…</code>
              <ScopeBadges scopes={apiKey.scopes} />
              {revoked && <Badge variant="destructive">Revoked</Badge>}
              {expired && <Badge variant="destructive">Expired</Badge>}
            </div>
            <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span>{ledgerLabel}</span>
              <span>Created {formatDate(apiKey.createdAt)}</span>
              <span>{apiKey.lastUsedAt ? `Last used ${formatRelative(apiKey.lastUsedAt)}` : "Never used"}</span>
              <span>{apiKey.expiresAt ? `${expired ? "Expired" : "Expires"} ${formatDate(apiKey.expiresAt)}` : "No expiry"}</span>
            </p>
          </div>
        </div>
        {!revoked && (
          <Button variant="outline" size="sm" className="self-start sm:self-center" onClick={onRevoke} aria-label={`Revoke ${apiKey.name}`}>
            Revoke
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function ApiKeysPage() {
  const keys = useApiKeys();
  const { data: me } = useMe();
  const ledgers = useLedgers(Boolean(me));
  const revoke = useRevokeApiKey();
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  async function confirmRevoke(target: ApiKey) {
    try {
      await revoke.mutateAsync(target.id);
      toast.success(`Revoked ${target.name}`);
      setRevoking(null);
    } catch (err) {
      console.error("revoke api key failed", err);
      toast.error(errorMessage(err));
    }
  }

  const createButton = (
    <Button onClick={() => setCreating(true)}>
      <PlusIcon data-icon="inline-start" /> Create key
    </Button>
  );

  return (
    <>
      <Usage />
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Your keys</h2>
          {keys.data && keys.data.length > 0 && createButton}
        </div>
        {keys.isPending ? (
          <CardSkeleton rows={2} />
        ) : keys.isError ? (
          <ErrorState error={keys.error} onRetry={() => void keys.refetch()} />
        ) : keys.data.length === 0 ? (
          <EmptyState
            icon={<KeyRoundIcon />}
            title="No API keys yet"
            description="Create a key to script reports, import transactions or connect another tool."
            action={createButton}
          />
        ) : (
          <div className="space-y-3">
            {keys.data.map((apiKey, i) => (
              <KeyRow
                key={apiKey.id}
                apiKey={apiKey}
                index={i}
                ledger={ledgers.data?.find((l) => l.id === apiKey.ledgerId)}
                onRevoke={() => setRevoking(apiKey)}
              />
            ))}
          </div>
        )}
      </section>
      <CreateApiKeyDialog open={creating} onOpenChange={setCreating} />
      <AlertDialog open={revoking !== null} onOpenChange={(open) => !open && !revoke.isPending && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revoking?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Anything using <span className="font-mono">{revoking?.keyPrefix}…</span> will stop working immediately. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoke.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revoke.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (revoking) void confirmRevoke(revoking);
              }}
            >
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
