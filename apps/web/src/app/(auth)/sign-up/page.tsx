"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { AuthCard, AuthLink, FormError, SubmitButton } from "@/components/auth/auth-form";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiPost, errorMessage } from "@/lib/api/client";
import { keys, useSystemInfo } from "@/lib/api/hooks";
import type { User } from "@/lib/api/types";
import { safeNext } from "@/lib/routes";

function SignUpForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const { data: info } = useSystemInfo();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // An invite link sends people here with `next`; everyone else goes on to create a workspace.
  const next = safeNext(params.get("next"), "/new");

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
      });
      qc.setQueryData(keys.me, user);
      router.replace(next);
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
          Already have an account? <AuthLink href={next === "/new" ? "/login" : `/login?next=${encodeURIComponent(next)}`}>Sign in</AuthLink>
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
              <FieldDescription>Lowercase letters, digits and hyphens.</FieldDescription>
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
          </FieldGroup>
          <FormError message={error} />
          <SubmitButton pending={pending}>Create account</SubmitButton>
        </form>
      )}
    </AuthCard>
  );
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
