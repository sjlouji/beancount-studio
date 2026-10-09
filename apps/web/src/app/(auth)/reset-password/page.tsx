"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AuthCard, AuthLink, FormError, SubmitButton } from "@/components/auth/auth-form";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiPost, errorMessage } from "@/lib/api/client";

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirm")) {
      setError("Passwords don't match");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiPost("/auth/reset-password", { token, password: form.get("password") });
      toast.success("Password updated. Sign in with your new password.");
      router.replace("/login");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard title="Choose a new password" footer={<AuthLink href="/login">Back to sign in</AuthLink>}>
      {!token ? (
        <FormError message="This reset link is missing its token. Request a new one." />
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="password">New password</FieldLabel>
              <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} autoFocus />
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
            </Field>
          </FieldGroup>
          <FormError message={error} />
          <SubmitButton pending={pending}>Update password</SubmitButton>
        </form>
      )}
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
