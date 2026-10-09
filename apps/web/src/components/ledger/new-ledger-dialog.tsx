"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { apiPost, errorMessage } from "@/lib/api/client";
import { keys } from "@/lib/api/hooks";
import type { Ledger } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const TEMPLATES = [
  { id: "starter", title: "Starter", description: "A sensible chart of accounts, ready for your first transactions." },
  { id: "blank", title: "Blank", description: "Just the options and an opening-balances account." },
  { id: "example", title: "Example", description: "Three years of generated data to explore every report." },
] as const;

export function NewLedgerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]["id"]>("starter");
  const [visibility, setVisibility] = useState<"private" | "public">("private");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      const ledger = await apiPost<Ledger>("/ledgers", {
        title: form.get("title"),
        description: form.get("description") || "",
        currency: String(form.get("currency") || "USD").toUpperCase(),
        template,
        visibility,
      });
      await qc.invalidateQueries({ queryKey: keys.ledgers });
      toast.success(`Created ${ledger.title}`);
      onOpenChange(false);
      router.push(`/ledger/${ledger.owner}/${ledger.slug}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">New ledger</DialogTitle>
            <DialogDescription>A ledger is a git repository of plain-text Beancount files.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="my-6">
            <Field>
              <FieldLabel htmlFor="ledger-title">Title</FieldLabel>
              <Input id="ledger-title" name="title" required autoFocus placeholder="Personal finances" maxLength={160} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="ledger-currency">Operating currency</FieldLabel>
                <Input id="ledger-currency" name="currency" defaultValue="USD" required maxLength={24} className="font-mono uppercase" />
              </Field>
              <Field>
                <FieldLabel>Visibility</FieldLabel>
                <Select value={visibility} onValueChange={(v) => setVisibility(v as "private" | "public")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="public">Public (read-only for everyone)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel>Start from</FieldLabel>
              <div className="grid gap-2 sm:grid-cols-3">
                {TEMPLATES.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setTemplate(item.id)}
                    aria-pressed={template === item.id}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors hover:bg-muted",
                      template === item.id && "border-primary bg-accent/60 ring-2 ring-primary/20",
                    )}
                  >
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="mt-1 text-xs leading-snug text-muted-foreground">{item.description}</div>
                  </button>
                ))}
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="ledger-description">Description</FieldLabel>
              <Textarea id="ledger-description" name="description" rows={2} placeholder="Optional" maxLength={2000} />
              <FieldDescription>Shown on the ledger list and, for public ledgers, in the gallery.</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner className="size-4" data-icon="inline-start" />}
              Create ledger
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
