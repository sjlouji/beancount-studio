"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthCard, AuthLink, FormError, SubmitButton } from "@/components/auth/auth-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiPost, errorMessage } from "@/lib/api/client";
import { keys, useSystemInfo } from "@/lib/api/hooks";
import type { User } from "@/lib/api/types";

export default function SignUpPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: info } = useSystemInfo();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [example, setExample] = useState(true);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const user = await apiPost<User>("/auth/sign-up", {
        email: form.get("email"),
        username: form.get("username"),
        password: form.get("password"),
        displayName: form.get("displayName"),
        createExampleLedger: example,
      });
      qc.setQueryData(keys.me, user);
      router.replace("/ledgers");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const firstUser = info && !info.hasUsers;

  return (
    <AuthCard
      title={firstUser ? "Set up your studio" : "Create your account"}
      subtitle={firstUser ? "You're the first user — this account becomes the administrator." : "A few details and you're in."}
      footer={
        <>
          Already have an account? <AuthLink href="/login">Sign in</AuthLink>
        </>
      }
    >
      {info && !info.signupEnabled ? (
        <FormError message="Sign-up is disabled on this server. Ask the administrator for an account." />
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="displayName">Name</FieldLabel>
              <Input id="displayName" name="displayName" autoComplete="name" placeholder="Ada Lovelace" />
            </Field>
            <Field>
              <FieldLabel htmlFor="username">Username</FieldLabel>
              <Input id="username" name="username" autoComplete="username" required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" placeholder="ada" />
              <FieldDescription>Lowercase letters, digits and hyphens. Your ledgers live at /ledger/username/…</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
              <FieldDescription>At least 8 characters.</FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <Checkbox id="example" checked={example} onCheckedChange={(v) => setExample(v === true)} />
              <FieldLabel htmlFor="example" className="font-normal">
                Add an example ledger so I can explore
              </FieldLabel>
            </Field>
          </FieldGroup>
          <FormError message={error} />
          <SubmitButton pending={pending}>Create account</SubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
