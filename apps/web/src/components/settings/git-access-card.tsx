"use client";

import { KeyRoundIcon } from "lucide-react";
import { toast } from "sonner";
import { ErrorState } from "@/components/app/states";
import { CopyButton } from "@/components/settings/copy-button";
import { SettingsCard } from "@/components/settings/settings-card";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/client";
import { useCreateSshKey, useDeleteSshKey, useSshKey } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";

/** One SSH key per account, generated on the server; the person adds the public half to their git host once. */
export function GitAccessCard({ index = 3 }: { index?: number }) {
  const key = useSshKey();
  const create = useCreateSshKey();
  const remove = useDeleteSshKey();

  return (
    <SettingsCard
      title="Git access"
      description="Ledgers connected over SSH push with this key. Add its public half to GitHub once (Settings → SSH and GPG keys); it never expires and covers every repository you can access."
      index={index}
    >
      {key.isPending ? (
        <Skeleton className="h-16" />
      ) : key.isError ? (
        <ErrorState error={key.error} onRetry={() => void key.refetch()} />
      ) : key.data ? (
        <div className="space-y-4">
          <pre className="overflow-x-auto rounded-sm border bg-muted px-3 py-2 font-mono text-[13px] break-all whitespace-pre-wrap">{key.data.publicKey}</pre>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="font-mono text-[13px]">{key.data.fingerprint}</span>
            <span>Created {formatDate(key.data.createdAt)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton value={key.data.publicKey} label="Copy public key" />
            <Button asChild variant="outline" size="sm">
              <a href="https://github.com/settings/keys" target="_blank" rel="noreferrer">
                Open GitHub SSH keys
              </a>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="text-negative">
                  Remove key
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove this SSH key?</AlertDialogTitle>
                  <AlertDialogDescription>Ledgers that push with it stop syncing until you generate a new key and add it to your git host. Keys in use by a connected ledger cannot be removed.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(undefined, { onSuccess: () => toast.success("SSH key removed"), onError: (error) => toast.error(errorMessage(error, "Couldn't remove the key")) })}>
                    {remove.isPending && <Spinner data-icon="inline-start" />} Remove key
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={create.isPending} onClick={() => create.mutate(undefined, { onSuccess: () => toast.success("SSH key generated. Add the public key to GitHub."), onError: (error) => toast.error(errorMessage(error, "Couldn't generate a key")) })}>
            {create.isPending ? <Spinner data-icon="inline-start" /> : <KeyRoundIcon data-icon="inline-start" />} Generate SSH key
          </Button>
          <span className="text-sm text-muted-foreground">No key yet. The private half stays encrypted on this server.</span>
        </div>
      )}
    </SettingsCard>
  );
}
