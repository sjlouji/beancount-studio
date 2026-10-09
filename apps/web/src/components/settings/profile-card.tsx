"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState } from "@/components/app/states";
import { SettingsCard } from "@/components/settings/settings-card";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api/client";
import { useMe, useUpdateProfile } from "@/lib/api/hooks";
import type { User } from "@/lib/api/types";
import { useQueryClient } from "@tanstack/react-query";

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

interface ProfileFields {
  displayName: string;
  username: string;
  bio: string;
  website: string;
  location: string;
}

function fieldsOf(user: User): ProfileFields {
  return { displayName: user.displayName, username: user.username, bio: user.bio, website: user.website, location: user.location };
}

function ProfileForm({ me }: { me: User }) {
  const update = useUpdateProfile();
  const qc = useQueryClient();
  const [form, setForm] = useState<ProfileFields>(() => fieldsOf(me));
  const saved = fieldsOf(me);
  const changed = (Object.keys(form) as Array<keyof ProfileFields>).filter((key) => form[key] !== saved[key]);
  const usernameInvalid = !USERNAME_PATTERN.test(form.username);

  function set<K extends keyof ProfileFields>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (changed.length === 0 || usernameInvalid) return;
    const patch: Partial<ProfileFields> = {};
    for (const key of changed) patch[key] = form[key].trim();
    try {
      const user = await update.mutateAsync(patch);
      setForm(fieldsOf(user));
      // Profiles and ledger owners are keyed by username, so cached copies are stale after a rename.
      if (patch.username) {
        void qc.invalidateQueries({ queryKey: ["profile"] });
        void qc.invalidateQueries({ queryKey: ["ledgers"] });
      }
      toast.success("Profile updated");
    } catch (err) {
      console.error("update profile failed", err);
      toast.error(errorMessage(err));
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)}>
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="profile-display-name">Display name</FieldLabel>
            <Input id="profile-display-name" value={form.displayName} maxLength={120} autoComplete="name" disabled={update.isPending} onChange={(e) => set("displayName", e.target.value)} />
          </Field>
          <Field data-invalid={usernameInvalid || undefined}>
            <FieldLabel htmlFor="profile-username">Username</FieldLabel>
            <Input
              id="profile-username"
              value={form.username}
              maxLength={40}
              autoComplete="username"
              spellCheck={false}
              aria-invalid={usernameInvalid}
              className="font-mono"
              disabled={update.isPending}
              onChange={(e) => set("username", e.target.value.toLowerCase())}
            />
            {usernameInvalid ? (
              <FieldError>Use 3-40 lowercase letters, digits or hyphens, starting and ending with a letter or digit.</FieldError>
            ) : (
              <FieldDescription>
                Lowercase letters, digits and hyphens. Your ledgers live at /ledger/<span className="font-mono">{form.username}</span>/…
              </FieldDescription>
            )}
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="profile-bio">Bio</FieldLabel>
          <Textarea id="profile-bio" value={form.bio} rows={3} maxLength={2000} placeholder="A line or two about you" disabled={update.isPending} onChange={(e) => set("bio", e.target.value)} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="profile-website">Website</FieldLabel>
            <Input id="profile-website" type="url" value={form.website} maxLength={255} placeholder="https://example.com" disabled={update.isPending} onChange={(e) => set("website", e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-location">Location</FieldLabel>
            <Input id="profile-location" value={form.location} maxLength={120} placeholder="Lisbon, Portugal" disabled={update.isPending} onChange={(e) => set("location", e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/u/${me.username}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ExternalLinkIcon className="size-3.5" /> View public profile <span className="font-mono text-xs">/u/{me.username}</span>
          </Link>
          <div className="flex items-center gap-2">
            {changed.length > 0 && (
              <Button type="button" variant="ghost" disabled={update.isPending} onClick={() => setForm(saved)}>
                Reset
              </Button>
            )}
            <Button type="submit" disabled={update.isPending || changed.length === 0 || usernameInvalid}>
              {update.isPending && <Spinner className="size-4" data-icon="inline-start" />}
              Save changes
            </Button>
          </div>
        </div>
      </FieldGroup>
    </form>
  );
}

export function ProfileCard() {
  const me = useMe();
  return (
    <SettingsCard title="Profile" description="What other people see on your public profile and next to your ledgers." index={0}>
      {me.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-8" />
          <Skeleton className="h-20" />
          <Skeleton className="h-8" />
        </div>
      ) : me.isError ? (
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      ) : me.data === null ? (
        <EmptyState title="You're signed out" description="Sign in to edit your profile." action={<Button asChild size="sm"><Link href="/login">Sign in</Link></Button>} />
      ) : (
        <ProfileForm me={me.data} />
      )}
    </SettingsCard>
  );
}
