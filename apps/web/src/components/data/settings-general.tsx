"use client";

import { GlobeIcon, LockIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { apiPatch, errorMessage } from "@/lib/api/client";
import { keys, ledgerPath } from "@/lib/api/hooks";
import type { Ledger } from "@/lib/api/types";

/** Mirrors the API's slug rule (apps/api/app/schemas.py SLUG_RE). */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

type LedgerPatch = Partial<Pick<Ledger, "title" | "description" | "slug" | "visibility">>;

function useUpdateLedger(ledger: Ledger) {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (patch: LedgerPatch) => apiPatch<Ledger>(ledgerPath(ledger.owner, ledger.slug), patch),
    onSuccess: async (updated) => {
      void qc.invalidateQueries({ queryKey: keys.ledgers });
      if (updated.slug !== ledger.slug) {
        // Cached data under the old slug would 404 on refetch, so drop it and move to the new URL.
        qc.removeQueries({ queryKey: keys.ledger(ledger.owner, ledger.slug) });
        router.replace(`/ledger/${updated.owner}/${updated.slug}/settings`);
      } else {
        await qc.invalidateQueries({ queryKey: keys.ledger(ledger.owner, ledger.slug) });
      }
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't update the ledger")),
  });
}

export function GeneralCard({ ledger }: { ledger: Ledger }) {
  const update = useUpdateLedger(ledger);
  const [title, setTitle] = useState(ledger.title);
  const [description, setDescription] = useState(ledger.description);
  const [slug, setSlug] = useState(ledger.slug);

  const slugValid = SLUG_PATTERN.test(slug);
  const dirty = title.trim() !== ledger.title || description.trim() !== ledger.description || slug !== ledger.slug;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const patch: LedgerPatch = {};
    if (title.trim() !== ledger.title) patch.title = title.trim();
    if (description.trim() !== ledger.description) patch.description = description.trim();
    if (slug !== ledger.slug) patch.slug = slug;
    update.mutate(patch, { onSuccess: () => toast.success("Ledger updated") });
  };

  return (
    <Card className="animate-rise">
      <form onSubmit={onSubmit}>
        <CardHeader>
          <CardTitle className="text-sm font-medium">General</CardTitle>
          <CardDescription>The name and address of this ledger.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="settings-title">Title</FieldLabel>
              <Input id="settings-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} />
            </Field>
            <Field>
              <FieldLabel htmlFor="settings-description">Description</FieldLabel>
              <Textarea id="settings-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={2000} />
            </Field>
            <Field data-invalid={!slugValid}>
              <FieldLabel htmlFor="settings-slug">Slug</FieldLabel>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">/ledger/{ledger.owner}/</span>
                <Input id="settings-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} aria-invalid={!slugValid} required maxLength={80} className="max-w-xs font-mono" />
              </div>
              <FieldDescription>{slugValid ? "Changing the slug changes every link to this ledger. Existing bookmarks will stop working." : "Use lowercase letters, digits and hyphens; start and end with a letter or digit."}</FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end border-t">
          <Button type="submit" disabled={!dirty || !slugValid || !title.trim() || update.isPending}>
            {update.isPending && <Spinner data-icon="inline-start" />} Save changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

const VISIBILITY_OPTIONS = [
  { value: "private", icon: LockIcon, title: "Private", description: "Only you and the collaborators you add can open this ledger." },
  { value: "public", icon: GlobeIcon, title: "Public", description: "Anyone with the link can read this ledger. Only people with write access can change it." },
] as const;

export function VisibilityCard({ ledger }: { ledger: Ledger }) {
  const update = useUpdateLedger(ledger);
  const [visibility, setVisibility] = useState<Ledger["visibility"]>(ledger.visibility);

  return (
    <Card className="animate-rise [animation-delay:40ms]">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Visibility</CardTitle>
        <CardDescription>Only the owner can change who can see this ledger.</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={visibility} onValueChange={(v) => setVisibility(v as Ledger["visibility"])} aria-label="Visibility">
          {VISIBILITY_OPTIONS.map(({ value, icon: Icon, title, description }) => (
            <FieldLabel key={value} htmlFor={`visibility-${value}`}>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>
                    <Icon className="size-4" /> {title}
                  </FieldTitle>
                  <FieldDescription>{description}</FieldDescription>
                </FieldContent>
                <RadioGroupItem value={value} id={`visibility-${value}`} />
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
      </CardContent>
      <CardFooter className="justify-end border-t">
        <Button
          disabled={visibility === ledger.visibility || update.isPending}
          onClick={() => update.mutate({ visibility }, { onSuccess: () => toast.success(`Ledger is now ${visibility}`) })}
        >
          {update.isPending && <Spinner data-icon="inline-start" />} Save visibility
        </Button>
      </CardFooter>
    </Card>
  );
}
