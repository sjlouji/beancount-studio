"use client";

import { LinkIcon, XIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ErrorState, ListSkeleton } from "@/components/app/states";
import { CopyButton } from "@/components/settings/copy-button";
import { SettingsCard } from "@/components/settings/settings-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/client";
import { useCreateInvite, useInvites, useRevokeInvite } from "@/lib/api/hooks";
import type { MintedInvite, Workspace, WorkspaceRole } from "@/lib/api/types";
import { formatDate, formatRelative } from "@/lib/format";
import { ROLE_LABELS, ROLE_OPTIONS, ROLE_RANK } from "./rules";

const EXPIRY_OPTIONS = [
  { value: "1", label: "1 day" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

/** The link, shown once; only its hash is kept on the server. */
export function InviteLinkReveal({ invite }: { invite: MintedInvite }) {
  return (
    <div className="space-y-3 rounded-lg border bg-surface p-3">
      <div className="font-mono text-[13px] break-all select-all">{invite.url}</div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-footnote text-muted-foreground">
          Anyone with this link joins as {ROLE_LABELS[invite.role].toLowerCase()} until {formatDate(invite.expiresAt)}. Revoking it stops that.
        </p>
        <CopyButton value={invite.url} label="Copy link" />
      </div>
    </div>
  );
}

/** Make an invite link: the role it grants and how long it lasts. Admins offer roles up to their own. */
export function InviteLinkForm({ workspace, onCreated }: { workspace: Workspace; onCreated?: (invite: MintedInvite) => void }) {
  const create = useCreateInvite(workspace.slug);
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [expiry, setExpiry] = useState("7");
  const [minted, setMinted] = useState<MintedInvite | null>(null);
  const offered = ROLE_OPTIONS.filter((option) => option.value !== "owner" && ROLE_RANK[option.value] <= ROLE_RANK[workspace.role]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const invite = await create.mutateAsync({ role, expiresInDays: Number(expiry) });
      setMinted(invite);
      onCreated?.(invite);
    } catch (err) {
      console.error("create invite failed", err);
      toast.error(errorMessage(err, "Couldn't create the invite link"));
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field>
          <FieldLabel htmlFor="invite-role">Joins as</FieldLabel>
          <Select value={role} onValueChange={(value) => setRole(value as WorkspaceRole)} disabled={create.isPending}>
            <SelectTrigger id="invite-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {offered.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{offered.find((option) => option.value === role)?.hint}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="invite-expiry">Link expires in</FieldLabel>
          <Select value={expiry} onValueChange={setExpiry} disabled={create.isPending}>
            <SelectTrigger id="invite-expiry" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button type="submit" disabled={create.isPending} className="sm:mb-5">
          {create.isPending ? <Spinner className="size-4" data-icon="inline-start" /> : <LinkIcon data-icon="inline-start" />}
          Create invite link
        </Button>
      </div>
      {minted && <InviteLinkReveal invite={minted} />}
    </form>
  );
}

/** The settings card: make links and see the live ones. */
export function InviteLinksCard({ workspace, index = 0 }: { workspace: Workspace; index?: number }) {
  const invites = useInvites(workspace.slug);
  const revoke = useRevokeInvite(workspace.slug);

  return (
    <SettingsCard id="invites" index={index} title="Invite links" description="A link admits anyone who has it, with the role you choose, until it expires or you revoke it.">
      <InviteLinkForm workspace={workspace} />
      {invites.isPending ? (
        <ListSkeleton rows={2} />
      ) : invites.isError ? (
        <ErrorState error={invites.error} onRetry={() => void invites.refetch()} />
      ) : invites.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No live links. The ones you create appear here with how often they were used.</p>
      ) : (
        <ul className="divide-y">
          {invites.data.map((invite) => (
            <li key={invite.id} className="flex items-center gap-3 py-2.5 text-sm">
              <Badge variant="secondary">{ROLE_LABELS[invite.role]}</Badge>
              <div className="min-w-0 flex-1 text-muted-foreground">
                <span className="tabular">{invite.uses}</span> {invite.uses === 1 ? "use" : "uses"} · expires {formatRelative(invite.expiresAt)}
                {invite.createdBy && (
                  <>
                    {" "}
                    · by <span className="font-mono">@{invite.createdBy}</span>
                  </>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Revoke invite link"
                disabled={revoke.isPending}
                onClick={() =>
                  revoke.mutate(invite.id, {
                    onSuccess: () => toast.success("Invite link revoked"),
                    onError: (error) => toast.error(errorMessage(error, "Couldn't revoke the link")),
                  })
                }
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}
