"use client";

import { AlertTriangleIcon, CheckIcon, GitBranchIcon, RefreshCwIcon, UnplugIcon } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/client";
import { useConnectRemote, useDisconnectRemote, useResolveRemote, useSyncRemote, useTestRepository } from "@/lib/api/hooks";
import type { Ledger, LedgerRemote, RemoteAuth, RemoteState } from "@/lib/api/types";
import { formatRelative } from "@/lib/format";

export const REMOTE_AUTH_LABELS: Record<RemoteAuth, string> = {
  none: "No credentials (public repository or server path)",
  token: "Access token",
  ssh_key: "My SSH key",
};

export const REMOTE_STATE_LABELS: Record<RemoteState, string> = {
  in_sync: "In sync",
  pushing: "Pushing",
  behind: "Behind the remote",
  diverged: "Diverged",
  error: "Push failed",
};

export function RemoteStateBadge({ state }: { state: RemoteState }) {
  if (state === "in_sync") {
    return (
      <Badge variant="secondary">
        <CheckIcon data-icon="inline-start" /> {REMOTE_STATE_LABELS.in_sync}
      </Badge>
    );
  }
  if (state === "pushing") {
    return (
      <Badge variant="secondary">
        <RefreshCwIcon className="animate-spin" data-icon="inline-start" /> {REMOTE_STATE_LABELS.pushing}
      </Badge>
    );
  }
  if (state === "behind") return <Badge variant="outline">{REMOTE_STATE_LABELS.behind}</Badge>;
  return (
    <Badge variant="destructive">
      <AlertTriangleIcon data-icon="inline-start" /> {REMOTE_STATE_LABELS[state]}
    </Badge>
  );
}

export interface RemoteSource {
  url: string;
  auth: RemoteAuth;
  token: string;
}

export const EMPTY_SOURCE: RemoteSource = { url: "", auth: "none", token: "" };

export function sourceIsComplete(source: RemoteSource): boolean {
  return source.url.trim().length > 0 && (source.auth !== "token" || source.token.length > 0);
}

/** Repository address, access method and a Test button; shared by the new-ledger dialog and the Remote card. */
export function RemoteSourceFields({ source, onChange, idPrefix }: { source: RemoteSource; onChange: (next: RemoteSource) => void; idPrefix: string }) {
  const test = useTestRepository();
  const update = (patch: Partial<RemoteSource>) => {
    onChange({ ...source, ...patch });
    test.reset();
  };
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-url`}>Repository</FieldLabel>
        <Input id={`${idPrefix}-url`} value={source.url} onChange={(e) => update({ url: e.target.value })} placeholder="git@github.com:you/books.git" autoComplete="off" spellCheck={false} required className="font-mono" />
        <FieldDescription>An https:// or ssh:// address, the git@host:path form, or an absolute path on this server (administrators).</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-auth`}>Access</FieldLabel>
        <Select value={source.auth} onValueChange={(value) => update({ auth: value as RemoteAuth })}>
          <SelectTrigger id={`${idPrefix}-auth`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(REMOTE_AUTH_LABELS) as RemoteAuth[]).map((auth) => (
              <SelectItem key={auth} value={auth}>
                {REMOTE_AUTH_LABELS[auth]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {source.auth === "ssh_key" && (
          <FieldDescription>
            Uses the SSH key from your{" "}
            <Link href="/settings" className="link">
              account settings
            </Link>
            . Add its public half to GitHub once; it never expires.
          </FieldDescription>
        )}
      </Field>
      {source.auth === "token" && (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-token`}>Token</FieldLabel>
          <Input id={`${idPrefix}-token`} type="password" value={source.token} onChange={(e) => update({ token: e.target.value })} autoComplete="off" required />
          <FieldDescription>Stored encrypted on the server and never shown again. Pick a token that does not expire if this should keep working.</FieldDescription>
        </Field>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={!sourceIsComplete(source) || test.isPending} onClick={() => test.mutate({ url: source.url.trim(), auth: source.auth, token: source.auth === "token" ? source.token : undefined })}>
          {test.isPending && <Spinner data-icon="inline-start" />} Test connection
        </Button>
        {test.isSuccess && <span className="text-sm text-positive">Reachable{test.data.defaultBranch ? ` · default branch ${test.data.defaultBranch}` : " · empty repository"}</span>}
        {test.isError && (
          <span role="alert" className="text-sm text-negative">
            {errorMessage(test.error)}
          </span>
        )}
      </div>
    </>
  );
}

export function RemoteCard({ ledger }: { ledger: Ledger }) {
  return ledger.remote ? <ConnectedRemoteCard ledger={ledger} remote={ledger.remote} /> : <ConnectRemoteCard ledger={ledger} />;
}

function ConnectRemoteCard({ ledger }: { ledger: Ledger }) {
  const connect = useConnectRemote(ledger.owner, ledger.slug);
  const [source, setSource] = useState<RemoteSource>(EMPTY_SOURCE);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    connect.mutate(
      { url: source.url.trim(), auth: source.auth, token: source.auth === "token" ? source.token : undefined },
      {
        onSuccess: () => toast.success("Connected. Pushing the ledger's history now."),
        onError: (error) => toast.error(errorMessage(error, "Couldn't connect the repository")),
      },
    );
  };

  return (
    <Card className="animate-rise [animation-delay:120ms]">
      <form onSubmit={onSubmit}>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Remote repository</CardTitle>
          <CardDescription>Connect a git repository and every change made here is pushed to it. Sync brings in commits made elsewhere.</CardDescription>
        </CardHeader>
        <CardContent>
          {ledger.canAdmin ? (
            <FieldGroup>
              <RemoteSourceFields source={source} onChange={setSource} idPrefix="remote" />
            </FieldGroup>
          ) : (
            <p className="text-sm text-muted-foreground">Not connected. An admin of this ledger can connect one.</p>
          )}
        </CardContent>
        {ledger.canAdmin && (
          <CardFooter className="justify-end border-t">
            <Button type="submit" disabled={!sourceIsComplete(source) || connect.isPending}>
              {connect.isPending && <Spinner data-icon="inline-start" />} Connect and push
            </Button>
          </CardFooter>
        )}
      </form>
    </Card>
  );
}

function ResolveButton({ keep, label, description, pending, onConfirm }: { keep: "local" | "remote"; label: string; description: string; pending: boolean; onConfirm: (keep: "local" | "remote") => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {/* A plain Button, not AlertDialogAction, so the dialog stays open until the request settles. */}
          <Button variant="destructive" disabled={pending} onClick={() => onConfirm(keep)}>
            {pending && <Spinner data-icon="inline-start" />} {label}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ConnectedRemoteCard({ ledger, remote }: { ledger: Ledger; remote: LedgerRemote }) {
  const sync = useSyncRemote(ledger.owner, ledger.slug);
  const disconnect = useDisconnectRemote(ledger.owner, ledger.slug);
  const resolve = useResolveRemote(ledger.owner, ledger.slug);

  const runSync = () =>
    sync.mutate(undefined, {
      onSuccess: (next) => (next.state === "in_sync" ? toast.success("In sync with the remote") : toast.error(next.lastError || REMOTE_STATE_LABELS[next.state])),
      onError: (error) => toast.error(errorMessage(error, "Couldn't sync")),
    });
  const runResolve = (keep: "local" | "remote") =>
    resolve.mutate(keep, {
      onSuccess: (next) => (next.state === "in_sync" ? toast.success(keep === "remote" ? "Replaced with the remote's version" : "The remote now matches this ledger") : toast.error(next.lastError)),
      onError: (error) => toast.error(errorMessage(error, "Couldn't resolve the divergence")),
    });

  return (
    <Card className="animate-rise [animation-delay:120ms]">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Remote repository</CardTitle>
        <CardDescription>Every change made here is pushed to this repository. Sync brings in commits made elsewhere.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">Repository</dt>
          <dd className="font-mono text-[13px] break-all">{remote.url}</dd>
          <dt className="text-muted-foreground">Branch</dt>
          <dd className="font-mono text-[13px]">
            <GitBranchIcon className="mr-1 inline size-3.5" aria-hidden /> {remote.branch}
          </dd>
          <dt className="text-muted-foreground">Access</dt>
          <dd>{REMOTE_AUTH_LABELS[remote.auth]}</dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <RemoteStateBadge state={remote.state} />
            <span className="text-muted-foreground">{remote.lastSyncedAt ? `Last synced ${formatRelative(remote.lastSyncedAt)}` : "Not synced yet"}</span>
          </dd>
        </dl>
        {remote.lastError && (
          <Alert variant="destructive">
            <AlertTriangleIcon />
            <AlertTitle>{REMOTE_STATE_LABELS[remote.state]}</AlertTitle>
            <AlertDescription>{remote.lastError}</AlertDescription>
          </Alert>
        )}
        {remote.state === "diverged" && ledger.canAdmin && (
          <div className="flex flex-wrap gap-2">
            <ResolveButton keep="remote" label="Keep the remote's version" description="Replaces this ledger's files and history with the remote branch. Changes made here since the two split are discarded." pending={resolve.isPending} onConfirm={runResolve} />
            <ResolveButton keep="local" label="Keep this ledger's version" description="Overwrites the remote branch with this ledger's history. Commits made elsewhere since the two split are discarded." pending={resolve.isPending} onConfirm={runResolve} />
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-between gap-2 border-t">
        {ledger.canAdmin ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" size="sm">
                <UnplugIcon data-icon="inline-start" /> Disconnect
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect this repository?</AlertDialogTitle>
                <AlertDialogDescription>The ledger keeps its files and history here. Nothing is pushed any more, and stored credentials for it are removed.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button variant="destructive" disabled={disconnect.isPending} onClick={() => disconnect.mutate(undefined, { onSuccess: () => toast.success("Disconnected"), onError: (error) => toast.error(errorMessage(error, "Couldn't disconnect")) })}>
                  {disconnect.isPending && <Spinner data-icon="inline-start" />} Disconnect
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <span />
        )}
        {ledger.canWrite && (
          <Button type="button" variant="secondary" disabled={sync.isPending || remote.state === "pushing"} onClick={runSync}>
            {sync.isPending ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />} Sync now
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
