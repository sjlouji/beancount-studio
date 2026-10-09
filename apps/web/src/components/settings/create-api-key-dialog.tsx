"use client";

import { AlertTriangleIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/settings/copy-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/client";
import { useCreateApiKey, useLedgers } from "@/lib/api/hooks";
import type { MintedApiKey } from "@/lib/api/types";

const ALL_LEDGERS = "all";
const EXPIRY_OPTIONS = [
  { value: "never", label: "Never" },
  { value: "30", label: "In 30 days" },
  { value: "90", label: "In 90 days" },
  { value: "365", label: "In 1 year" },
];

function KeyForm({ onCreated, onCancel }: { onCreated: (key: MintedApiKey) => void; onCancel: () => void }) {
  const ledgers = useLedgers();
  const create = useCreateApiKey();
  const [name, setName] = useState("");
  const [access, setAccess] = useState<"read" | "write">("read");
  const [ledgerId, setLedgerId] = useState(ALL_LEDGERS);
  const [expiry, setExpiry] = useState("never");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      const minted = await create.mutateAsync({
        name: name.trim(),
        scopes: access === "write" ? ["read", "write"] : ["read"],
        ledgerId: ledgerId === ALL_LEDGERS ? null : ledgerId,
        expiresInDays: expiry === "never" ? null : Number(expiry),
      });
      onCreated(minted);
    } catch (err) {
      console.error("create api key failed", err);
      toast.error(errorMessage(err));
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)}>
      <DialogHeader>
        <DialogTitle className="font-heading text-2xl">Create API key</DialogTitle>
        <DialogDescription>Keys act on your behalf over the REST API. Give each integration its own key so you can revoke it independently.</DialogDescription>
      </DialogHeader>
      <FieldGroup className="my-6">
        <Field>
          <FieldLabel htmlFor="key-name">Name</FieldLabel>
          <Input id="key-name" value={name} required autoFocus maxLength={80} placeholder="Budget script" disabled={create.isPending} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel>Access</FieldLabel>
          <RadioGroup value={access} onValueChange={(v) => setAccess(v as "read" | "write")} className="grid-cols-2" disabled={create.isPending}>
            <Label htmlFor="access-read" className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 has-data-checked:border-primary has-data-checked:bg-accent/60">
              <RadioGroupItem id="access-read" value="read" className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">Read only</span>
                <span className="block text-xs font-normal text-muted-foreground">Reports, journal, queries</span>
              </span>
            </Label>
            <Label htmlFor="access-write" className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 has-data-checked:border-primary has-data-checked:bg-accent/60">
              <RadioGroupItem id="access-write" value="write" className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">Read &amp; write</span>
                <span className="block text-xs font-normal text-muted-foreground">Also add and edit entries</span>
              </span>
            </Label>
          </RadioGroup>
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel>Ledger</FieldLabel>
            <Select value={ledgerId} onValueChange={setLedgerId} disabled={create.isPending}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_LEDGERS}>All ledgers</SelectItem>
                {ledgers.data?.map((ledger) => (
                  <SelectItem key={ledger.id} value={ledger.id}>
                    {ledger.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {ledgers.isError && <FieldDescription>Couldn&apos;t load your ledgers: {errorMessage(ledgers.error)}</FieldDescription>}
          </Field>
          <Field>
            <FieldLabel>Expires</FieldLabel>
            <Select value={expiry} onValueChange={setExpiry} disabled={create.isPending}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={create.isPending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending || !name.trim()}>
          {create.isPending && <Spinner className="size-4" data-icon="inline-start" />}
          Create key
        </Button>
      </DialogFooter>
    </form>
  );
}

function KeyReveal({ minted, onDone }: { minted: MintedApiKey; onDone: () => void }) {
  return (
    <div>
      <DialogHeader>
        <DialogTitle className="font-heading text-2xl">Copy your key now</DialogTitle>
        <DialogDescription>
          <span className="font-medium text-foreground">{minted.name}</span> was created.
        </DialogDescription>
      </DialogHeader>
      <div className="my-6 space-y-3">
        <div className="rounded-lg border bg-surface p-3 font-mono text-[13px] break-all select-all">{minted.key}</div>
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>This is the only time the full key is shown. Store it in a password manager or secret store; if you lose it, revoke it and create a new one.</p>
        </div>
      </div>
      <DialogFooter>
        <CopyButton value={minted.key} label="Copy key" />
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}

export function CreateApiKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [minted, setMinted] = useState<MintedApiKey | null>(null);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) setMinted(null);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {minted ? <KeyReveal minted={minted} onDone={() => handleOpenChange(false)} /> : <KeyForm onCreated={setMinted} onCancel={() => handleOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
