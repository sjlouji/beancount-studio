"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { EMPTY_SOURCE, RemoteSourceFields, sourceIsComplete, type RemoteSource } from "@/components/data/settings-remote";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiPost, errorMessage, isApiError } from "@/lib/api/client";
import { keys } from "@/lib/api/hooks";
import type { Ledger } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const TEMPLATES = [
  { id: "starter", title: "Starter", description: "A sensible chart of accounts, ready for your first transactions." },
  { id: "blank", title: "Blank", description: "Just the options and an opening-balances account." },
  { id: "example", title: "Example", description: "Three years of generated data to explore every report." },
] as const;

type Mode = "fresh" | "repository";

export function NewLedgerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<Mode>("fresh");
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]["id"]>("starter");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [source, setSource] = useState<RemoteSource>(EMPTY_SOURCE);
  // Set when the repository has several ledger files at its top level and the API asked which one.
  const [candidates, setCandidates] = useState<string[]>([]);
  const [mainFile, setMainFile] = useState("");

  const repositoryReady = sourceIsComplete(source) && (candidates.length === 0 || mainFile !== "");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const common = { title: form.get("title"), description: form.get("description") || "", visibility };
    const body =
      mode === "fresh"
        ? { ...common, currency: String(form.get("currency") || "USD").toUpperCase(), template }
        : { ...common, source: { url: source.url.trim(), auth: source.auth, token: source.auth === "token" ? source.token : undefined, mainFile: mainFile || undefined } };
    setPending(true);
    try {
      const ledger = await apiPost<Ledger>("/ledgers", body);
      await qc.invalidateQueries({ queryKey: keys.ledgers });
      toast.success(mode === "fresh" ? `Created ${ledger.title}` : `Imported ${ledger.title}`);
      onOpenChange(false);
      router.push(`/ledger/${ledger.owner}/${ledger.slug}`);
    } catch (err) {
      if (isApiError(err) && err.code === "main_file_required") {
        const found = err.details.candidates;
        setCandidates(Array.isArray(found) ? found.map(String) : []);
        toast.message("Choose which file is the main ledger");
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle className="type-title-2">New ledger</DialogTitle>
            <DialogDescription>A ledger is a git repository of plain-text Beancount files.</DialogDescription>
          </DialogHeader>
          <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)} className="my-6 gap-6">
            <TabsList className="w-full">
              <TabsTrigger value="fresh">Start fresh</TabsTrigger>
              <TabsTrigger value="repository">From a repository</TabsTrigger>
            </TabsList>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="ledger-title">Title</FieldLabel>
                <Input id="ledger-title" name="title" required autoFocus placeholder="Personal finances" maxLength={160} />
              </Field>
              <TabsContent value="fresh" className="flex flex-col gap-6">
                <div className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel htmlFor="ledger-currency">Operating currency</FieldLabel>
                    <Input id="ledger-currency" name="currency" defaultValue="USD" required maxLength={24} className="font-mono uppercase" />
                  </Field>
                  <VisibilityField visibility={visibility} onChange={setVisibility} />
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
              </TabsContent>
              <TabsContent value="repository" className="flex flex-col gap-6">
                <RemoteSourceFields
                  source={source}
                  onChange={(next) => {
                    setSource(next);
                    if (next.url !== source.url) {
                      setCandidates([]);
                      setMainFile("");
                    }
                  }}
                  idPrefix="new-ledger"
                />
                {candidates.length > 0 && (
                  <Field>
                    <FieldLabel htmlFor="new-ledger-main-file">Main ledger file</FieldLabel>
                    <Select value={mainFile} onValueChange={setMainFile}>
                      <SelectTrigger id="new-ledger-main-file" className="w-full font-mono">
                        <SelectValue placeholder="Choose a file" />
                      </SelectTrigger>
                      <SelectContent>
                        {candidates.map((name) => (
                          <SelectItem key={name} value={name} className="font-mono">
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>The repository has several ledger files at its top level. Reports load this one.</FieldDescription>
                  </Field>
                )}
                <VisibilityField visibility={visibility} onChange={setVisibility} />
              </TabsContent>
              <Field>
                <FieldLabel htmlFor="ledger-description">Description</FieldLabel>
                <Textarea id="ledger-description" name="description" rows={2} placeholder="Optional" maxLength={2000} />
                <FieldDescription>Shown on the ledger list.</FieldDescription>
              </Field>
            </FieldGroup>
          </Tabs>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || (mode === "repository" && !repositoryReady)}>
              {pending && <Spinner className="size-4" data-icon="inline-start" />}
              {mode === "fresh" ? "Create ledger" : "Import repository"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VisibilityField({ visibility, onChange }: { visibility: "private" | "public"; onChange: (value: "private" | "public") => void }) {
  return (
    <Field>
      <FieldLabel htmlFor="ledger-visibility">Visibility</FieldLabel>
      <Select value={visibility} onValueChange={(value) => onChange(value as "private" | "public")}>
        <SelectTrigger id="ledger-visibility" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="private">Private</SelectItem>
          <SelectItem value="public">Public (read-only for everyone)</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}
