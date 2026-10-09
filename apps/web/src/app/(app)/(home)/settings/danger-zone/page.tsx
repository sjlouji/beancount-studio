"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SettingsCard } from "@/components/settings/settings-card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { apiDelete, errorMessage } from "@/lib/api/client";

export default function DangerZonePage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const remove = useMutation({
    mutationFn: (input: { password: string }) => apiDelete<void>("/users/me", input),
  });

  function handleOpenChange(next: boolean) {
    if (remove.isPending) return;
    setOpen(next);
    if (!next) setPassword("");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!password) return;
    try {
      await remove.mutateAsync({ password });
      qc.clear();
      // Full page load (not router.push) so no authenticated client state survives.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    } catch (err) {
      console.error("delete account failed", err);
      toast.error(errorMessage(err));
    }
  }

  return (
    <SettingsCard
      tone="danger"
      title="Delete account"
      description="Permanently deletes your account and every ledger you own, including their git repositories, history and uploaded files. Ledgers other people own are not affected, but you lose access to them. This can't be undone."
    >
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive">Delete my account</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <form onSubmit={(e) => void onSubmit(e)} className="contents">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>All ledgers you own will be deleted for good. Enter your password to confirm.</AlertDialogDescription>
            </AlertDialogHeader>
            <Field>
              <FieldLabel htmlFor="delete-password">Password</FieldLabel>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                disabled={remove.isPending}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <AlertDialogFooter>
              <Button type="button" variant="ghost" disabled={remove.isPending} onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={remove.isPending || !password}>
                {remove.isPending && <Spinner className="size-4" data-icon="inline-start" />}
                Delete account
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsCard>
  );
}
