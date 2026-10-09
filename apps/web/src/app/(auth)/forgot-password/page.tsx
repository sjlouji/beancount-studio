"use client";

import { useState, type FormEvent } from "react";
import { AuthCard, AuthLink, FormError, SubmitButton } from "@/components/auth/auth-form";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiPost, errorMessage } from "@/lib/api/client";

export default function ForgotPasswordPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await apiPost("/auth/forgot-password", { email: form.get("email") });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a link that works for two hours."
      footer={
        <>
          Remembered it? <AuthLink href="/login">Back to sign in</AuthLink>
        </>
      }
    >
      {sent ? (
        <p className="rounded-lg border bg-accent/40 px-4 py-3 text-sm">If an account exists for that address, a reset link is on its way.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
            </Field>
          </FieldGroup>
          <FormError message={error} />
          <SubmitButton pending={pending}>Send reset link</SubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
