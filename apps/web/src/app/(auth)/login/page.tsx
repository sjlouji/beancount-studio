"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { AuthCard, AuthLink, FormError, SubmitButton } from "@/components/auth/auth-form";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiPost, errorMessage } from "@/lib/api/client";
import { keys, useSystemInfo } from "@/lib/api/hooks";
import type { User } from "@/lib/api/types";

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/ledgers";
  return value;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const { data: info } = useSystemInfo();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const user = await apiPost<User>("/auth/login", { identifier: form.get("identifier"), password: form.get("password") });
      qc.setQueryData(keys.me, user);
      router.replace(safeNext(params.get("next")));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your ledgers."
      footer={
        info?.signupEnabled ? (
          <>
            New here? <AuthLink href="/sign-up">Create an account</AuthLink>
          </>
        ) : undefined
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="identifier">Email or username</FieldLabel>
            <Input id="identifier" name="identifier" autoComplete="username" required autoFocus />
          </Field>
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <AuthLink href="/forgot-password">Forgot?</AuthLink>
            </div>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
        </FieldGroup>
        <FormError message={error} />
        <SubmitButton pending={pending}>Sign in</SubmitButton>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
