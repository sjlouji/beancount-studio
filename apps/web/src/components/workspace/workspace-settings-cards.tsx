"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LogOutIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SettingsCard } from "@/components/settings/settings-card";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/client";
import { keys, useDeleteWorkspace, useMe, useRemoveMember, useUpdateWorkspace } from "@/lib/api/hooks";
import type { Member, Workspace } from "@/lib/api/types";
import { rememberWorkspace, workspaceHref } from "@/lib/routes";
import { WORKSPACE_SLUG_PATTERN } from "./rules";

export function GeneralCard({ workspace, index = 0 }: { workspace: Workspace; index?: number }) {
  const router = useRouter();
  const update = useUpdateWorkspace(workspace.slug);
  const [name, setName] = useState(workspace.name);
  const [slug, setSlug] = useState(workspace.slug);
  const slugValid = WORKSPACE_SLUG_PATTERN.test(slug);
  const dirty = name.trim() !== workspace.name || slug !== workspace.slug;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const patch: { name?: string; slug?: string } = {};
    if (name.trim() !== workspace.name) patch.name = name.trim();
    if (slug !== workspace.slug) patch.slug = slug;
    update.mutate(patch, {
      onSuccess: (updated) => {
        toast.success("Workspace updated");
        if (updated.slug !== workspace.slug) {
          // Every address under the workspace changed with it.
          rememberWorkspace(updated.slug);
          router.replace(`${workspaceHref(updated.slug)}/settings`);
        }
      },
      onError: (error) => toast.error(errorMessage(error, "Couldn't update the workspace")),
    });
  };

  return (
    <SettingsCard index={index} title="General" description="The name people see and the address every page of this workspace starts with.">
      <form onSubmit={onSubmit} className="space-y-5">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="workspace-name">Name</FieldLabel>
            <Input id="workspace-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
          </Field>
          <Field data-invalid={!slugValid}>
            <FieldLabel htmlFor="workspace-slug">Address</FieldLabel>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">/w/</span>
              <Input id="workspace-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} aria-invalid={!slugValid} required maxLength={40} className="max-w-xs font-mono" />
            </div>
            <FieldDescription>{slugValid ? "Changing the address changes every link into this workspace, including links to its ledgers." : "Use 3–40 lowercase letters, digits and hyphens; start and end with a letter or digit."}</FieldDescription>
          </Field>
        </FieldGroup>
        <div className="flex justify-end">
          <Button type="submit" disabled={!dirty || !slugValid || !name.trim() || update.isPending}>
            {update.isPending && <Spinner data-icon="inline-start" />} Save changes
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}

/** Anyone may leave, except the only owner; they hand ownership on or delete the workspace instead. */
export function LeaveCard({ workspace, members, index = 0 }: { workspace: Workspace; members: Member[]; index?: number }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const leave = useRemoveMember(workspace.slug);
  const owners = members.filter((member) => member.role === "owner").length;
  const lastOwner = workspace.role === "owner" && owners <= 1;

  return (
    <SettingsCard
      index={index}
      title="Leave workspace"
      description={lastOwner ? "You are the only owner. Make someone else an owner first, or delete the workspace below." : "You lose access to every ledger here. An owner or admin can invite you back."}
    >
      <Button
        variant="outline"
        disabled={lastOwner || !me || leave.isPending}
        onClick={() =>
          me &&
          leave.mutate(me.username, {
            onSuccess: () => {
              toast.success(`You left ${workspace.name}`);
              qc.removeQueries({ queryKey: keys.workspaceScope(workspace.slug) });
              router.replace("/");
            },
            onError: (error) => toast.error(errorMessage(error, "Couldn't leave the workspace")),
          })
        }
      >
        {leave.isPending ? <Spinner data-icon="inline-start" /> : <LogOutIcon data-icon="inline-start" />} Leave {workspace.name}
      </Button>
    </SettingsCard>
  );
}

export function DangerCard({ workspace, index = 0 }: { workspace: Workspace; index?: number }) {
  const router = useRouter();
  const remove = useDeleteWorkspace(workspace.slug);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  return (
    <SettingsCard
      tone="danger"
      index={index}
      title="Delete workspace"
      description="Deletes every ledger in this workspace, their files and history, and removes every member. This cannot be undone. Download archives of the ledgers first if you might need them."
    >
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (remove.isPending) return;
          setOpen(next);
          if (!next) setTyped("");
        }}
      >
        <AlertDialogTrigger asChild>
          <Button variant="destructive">
            <Trash2Icon data-icon="inline-start" /> Delete this workspace
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {workspace.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Type <code className="font-mono text-foreground">{workspace.slug}</code> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={workspace.slug} aria-label="Type the workspace address to confirm" autoComplete="off" className="font-mono" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            {/* A plain Button, not AlertDialogAction, so the dialog stays open until the request settles. */}
            <Button
              variant="destructive"
              disabled={typed !== workspace.slug || remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => {
                    toast.success(`Deleted ${workspace.name}`);
                    setOpen(false);
                    router.replace("/");
                  },
                  onError: (error) => toast.error(errorMessage(error, "Couldn't delete the workspace")),
                })
              }
            >
              {remove.isPending && <Spinner data-icon="inline-start" />} Delete workspace
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsCard>
  );
}
