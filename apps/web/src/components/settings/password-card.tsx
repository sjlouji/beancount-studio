"use client";

import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SettingsCard } from "@/components/settings/settings-card";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { apiPost, errorMessage } from "@/lib/api/client";

export function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const change = useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) => apiPost<void>("/auth/change-password", input),
  });
  const mismatch = confirm.length > 0 && next !== confirm;
  const ready = current.length > 0 && next.length >= 8 && next === confirm;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    try {
      await change.mutateAsync({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password changed");
    } catch (err) {
      console.error("change password failed", err);
      toast.error(errorMessage(err));
    }
  }

  return (
    <SettingsCard title="Password" description="Use at least 8 characters. Other sessions stay signed in." index={2}>
      <form onSubmit={(e) => void onSubmit(e)}>
        <FieldGroup className="max-w-md">
          <Field>
            <FieldLabel htmlFor="current-password">Current password</FieldLabel>
            <Input id="current-password" type="password" autoComplete="current-password" value={current} disabled={change.isPending} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <Input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={200} value={next} disabled={change.isPending} onChange={(e) => setNext(e.target.value)} />
            <FieldDescription>8 characters minimum.</FieldDescription>
          </Field>
          <Field data-invalid={mismatch || undefined}>
            <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
            <Input id="confirm-password" type="password" autoComplete="new-password" aria-invalid={mismatch} value={confirm} disabled={change.isPending} onChange={(e) => setConfirm(e.target.value)} />
            {mismatch && <FieldError>Passwords don&apos;t match.</FieldError>}
          </Field>
          <div>
            <Button type="submit" disabled={change.isPending || !ready}>
              {change.isPending && <Spinner className="size-4" data-icon="inline-start" />}
              Change password
            </Button>
          </div>
        </FieldGroup>
      </form>
    </SettingsCard>
  );
}
