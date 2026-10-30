"use client";

import { CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { FocusShell } from "@/components/app/focus-shell";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { InviteLinkForm } from "@/components/workspace/invite-links";
import { WORKSPACE_SLUG_PATTERN, slugFromName } from "@/components/workspace/rules";
import { apiPost, errorMessage } from "@/lib/api/client";
import { keys, useCreateWorkspace, useWorkspaces } from "@/lib/api/hooks";
import type { Ledger, Workspace } from "@/lib/api/types";
import { rememberWorkspace, workspaceHref } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

const STEPS = ["Workspace", "First ledger", "Invite people"] as const;

const TEMPLATES = [
  { id: "starter", title: "Starter", description: "A sensible chart of accounts, ready for your first transactions." },
  { id: "blank", title: "Blank", description: "Just the options and an opening-balances account." },
  { id: "example", title: "Example", description: "Three years of generated data to explore every report." },
] as const;

// Fiscal years end on the last day of a month; December is the calendar year, the default.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_END = ["01-31", "02-28", "03-31", "04-30", "05-31", "06-30", "07-31", "08-31", "09-30", "10-31", "11-30", "12-31"];

function Stepper({ current }: { current: number }) {
  return (
    <ol className="mb-8 flex items-center gap-3" aria-label="Steps">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span className={cn("flex size-6 items-center justify-center rounded-full text-[11px] font-semibold", done ? "bg-primary text-primary-foreground" : active ? "bg-secondary text-secondary-foreground ring-2 ring-primary/30" : "bg-fill text-muted-foreground")} aria-current={active ? "step" : undefined}>
              {done ? <CheckIcon className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("type-caption-2", active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-border" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

function WorkspaceStep({ first, onDone }: { first: boolean; onDone: (workspace: Workspace) => void }) {
  const create = useCreateWorkspace();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const address = slugTouched ? slug : slugFromName(name);
  const addressValid = WORKSPACE_SLUG_PATTERN.test(address);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const workspace = await create.mutateAsync({ name: name.trim(), slug: address });
      rememberWorkspace(workspace.slug);
      onDone(workspace);
    } catch (err) {
      console.error("create workspace failed", err);
      toast.error(errorMessage(err, "Couldn't create the workspace"));
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-6">
      <div>
        <h1 className="type-title-1">{first ? "Set up your workspace" : "Create a workspace"}</h1>
        <p className="mt-2 type-body text-muted-foreground">A workspace holds ledgers and the people who share them, like a household, a club or a company.</p>
      </div>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="workspace-name">Name</FieldLabel>
          <Input id="workspace-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus maxLength={120} placeholder="Lovelace household" disabled={create.isPending} />
        </Field>
        <Field data-invalid={name !== "" && !addressValid}>
          <FieldLabel htmlFor="workspace-slug">Address</FieldLabel>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">/w/</span>
            <Input
              id="workspace-slug"
              value={address}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
              aria-invalid={name !== "" && !addressValid}
              required
              maxLength={40}
              className="font-mono"
              disabled={create.isPending}
            />
          </div>
          <FieldDescription>{addressValid || name === "" ? "Every page of the workspace starts with this. You can change it later." : "Use 3–40 lowercase letters, digits and hyphens; start and end with a letter or digit."}</FieldDescription>
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" className="w-full" disabled={create.isPending || !name.trim() || !addressValid}>
        {create.isPending && <Spinner className="size-4" data-icon="inline-start" />}
        Create workspace
      </Button>
    </form>
  );
}

function LedgerStep({ workspace, onDone }: { workspace: Workspace; onDone: () => void }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]["id"]>("starter");
  const [yearEnd, setYearEnd] = useState("11"); // index into MONTHS; December

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const month = Number(yearEnd);
    setPending(true);
    try {
      const ledger = await apiPost<Ledger>(`/workspaces/${encodeURIComponent(workspace.slug)}/ledgers`, {
        title: form.get("title"),
        template,
        currency: String(form.get("currency") || "USD").toUpperCase(),
        fiscalYearEnd: month === 11 ? undefined : MONTH_END[month],
      });
      await Promise.all([qc.invalidateQueries({ queryKey: keys.ledgers }), qc.invalidateQueries({ queryKey: keys.workspaces }), qc.invalidateQueries({ queryKey: keys.workspaceScope(workspace.slug) })]);
      toast.success(`Created ${ledger.title}`);
      onDone();
    } catch (err) {
      console.error("create first ledger failed", err);
      toast.error(errorMessage(err, "Couldn't create the ledger"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <h1 className="type-title-1">Your first ledger</h1>
        <p className="mt-2 type-body text-muted-foreground">A ledger is a git repository of plain-text Beancount files. Everyone in {workspace.name} will see it.</p>
      </div>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="ledger-title">Title</FieldLabel>
          <Input id="ledger-title" name="title" required autoFocus maxLength={160} placeholder="Personal finances" disabled={pending} />
        </Field>
        <Field>
          <FieldLabel>Start from</FieldLabel>
          <div className="grid gap-2 sm:grid-cols-3">
            {TEMPLATES.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => setTemplate(item.id)}
                aria-pressed={template === item.id}
                disabled={pending}
                className={cn("rounded-lg border p-3 text-left transition-colors hover:bg-muted", template === item.id && "border-primary bg-accent/60 ring-2 ring-primary/20")}
              >
                <div className="text-sm font-medium">{item.title}</div>
                <div className="mt-1 text-xs leading-snug text-muted-foreground">{item.description}</div>
              </button>
            ))}
          </div>
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ledger-currency">Operating currency</FieldLabel>
            <Input id="ledger-currency" name="currency" defaultValue="USD" required maxLength={24} className="font-mono uppercase" disabled={pending} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ledger-year-end">Fiscal year ends in</FieldLabel>
            <Select value={yearEnd} onValueChange={setYearEnd} disabled={pending}>
              <SelectTrigger id="ledger-year-end" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((month, i) => (
                  <SelectItem key={month} value={String(i)}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>December is the calendar year.</FieldDescription>
          </Field>
        </div>
      </FieldGroup>
      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending && <Spinner className="size-4" data-icon="inline-start" />}
          Create ledger
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          I&apos;ll import a repository later
        </Button>
      </div>
    </form>
  );
}

function InviteStep({ workspace, onDone }: { workspace: Workspace; onDone: () => void }) {
  const [created, setCreated] = useState(false);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="type-title-1">Invite people</h1>
        <p className="mt-2 type-body text-muted-foreground">Share a link and they join {workspace.name} with the role you pick. You can always do this later from the workspace settings.</p>
      </div>
      <InviteLinkForm workspace={workspace} onCreated={() => setCreated(true)} />
      <Button type="button" size="lg" className="w-full" variant={created ? "default" : "ghost"} onClick={onDone}>
        {created ? "Open the workspace" : "Skip for now"}
      </Button>
    </div>
  );
}

export default function NewWorkspacePage() {
  const router = useRouter();
  const existing = useWorkspaces();
  const [step, setStep] = useState(0);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const first = existing.isSuccess && existing.data.length === 0;

  return (
    <FocusShell>
      <Stepper current={step} />
      {step === 0 && (
        <WorkspaceStep
          first={first}
          onDone={(created) => {
            setWorkspace(created);
            setStep(1);
          }}
        />
      )}
      {step === 1 && workspace && <LedgerStep workspace={workspace} onDone={() => setStep(2)} />}
      {step === 2 && workspace && <InviteStep workspace={workspace} onDone={() => router.replace(workspaceHref(workspace.slug))} />}
    </FocusShell>
  );
}
