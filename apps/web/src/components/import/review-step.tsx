"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeftIcon, ArrowRightIcon, LandmarkIcon, SparklesIcon } from "lucide-react";
import { useMemo, useState, type Dispatch } from "react";
import { toast } from "sonner";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { AccountCombobox } from "@/components/ledger/account-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { apiPost, errorMessage } from "@/lib/api/client";
import { ledgerPath } from "@/lib/api/hooks";
import type { CategorySuggestion } from "@/lib/api/types";
import { pluralize } from "@/lib/format";
import { ImportTable } from "./import-table";
import { buildExistingKeySet, deriveRows, type ReviewRow, type WizardAction, type WizardState } from "./import-state";

const PAGE_SIZE = 100;

export function ReviewStep({
  state,
  dispatch,
  aiEnabled,
  onBack,
  onContinue,
}: {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
  aiEnabled: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  const { owner, slug } = useLedgerContext();
  const { statement, rows, sourceAccount, currency } = state;
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkAccount, setBulkAccount] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [attempted, setAttempted] = useState(false);

  const existing = useMemo(() => buildExistingKeySet(statement?.existingKeys ?? []), [statement]);
  const views = useMemo(() => deriveRows(rows, existing, sourceAccount, currency), [rows, existing, sourceAccount, currency]);
  const counts = useMemo(
    () => ({
      included: views.filter((v) => v.included).length,
      duplicates: views.filter((v) => v.duplicate).length,
      invalid: views.filter((v) => v.invalid).length,
    }),
    [views],
  );
  const missingTargets = views.filter((v) => v.included && !v.row.account).length;

  const problems: string[] = [];
  if (!sourceAccount) problems.push("Choose the source account these transactions belong to.");
  if (!currency.trim()) problems.push("Enter a currency.");
  if (counts.included === 0) problems.push("Include at least one transaction.");
  if (missingTargets > 0) problems.push(`${pluralize(missingTargets, "included row")} still need a target account.`);

  const categorize = useMutation({
    mutationFn: () =>
      apiPost<{ suggestions: CategorySuggestion[] }>(`${ledgerPath(owner, slug)}/imports/categorize`, {
        rows: rows.map((r) => ({ id: r.id, date: r.date || null, payee: r.payee, description: r.narration, amount: r.amount || null })),
        sourceAccount: sourceAccount || null,
        useAi: aiEnabled,
      }),
    onSuccess: ({ suggestions }) => {
      dispatch({ type: "suggestions", suggestions });
      toast.success(suggestions.length === 0 ? "No suggestions found" : `Suggested accounts for ${pluralize(suggestions.length, "row")}`);
    },
    onError: (err) => toast.error("Couldn't suggest categories", { description: errorMessage(err) }),
  });

  const patchOne = (id: number, patch: Partial<Omit<ReviewRow, "id">>) => dispatch({ type: "patch", ids: [id], patch });
  const selectedIds = Array.from(selected);
  const shown = views.slice(0, visible);

  return (
    <div className="space-y-5">
      <section className="grid gap-4 rounded-xl border bg-card p-5 card-elevated animate-rise md:grid-cols-[minmax(0,1fr)_9rem_auto] md:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="source-account">Source account</Label>
          <AccountCombobox
            id="source-account"
            value={sourceAccount}
            onChange={(account) => dispatch({ type: "source", account })}
            placeholder="Which account is this statement from?"
            icon={<LandmarkIcon className="size-3.5 text-muted-foreground" />}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="import-currency">Currency</Label>
          <Input id="import-currency" value={currency} onChange={(e) => dispatch({ type: "currency", currency: e.target.value.toUpperCase() })} className="font-mono uppercase" maxLength={24} />
        </div>
        <Button variant="outline" onClick={() => categorize.mutate()} disabled={categorize.isPending || rows.length === 0}>
          {categorize.isPending ? <Spinner data-icon="inline-start" /> : <SparklesIcon data-icon="inline-start" />}
          Suggest categories
        </Button>
        <p className="text-xs text-muted-foreground md:col-span-3">
          {aiEnabled ? "Suggestions come from your payee history first, then the AI model for unknown payees." : "Suggestions come from your payee history. Enable BS_ANTHROPIC_API_KEY on the server to also use the AI model."}
        </p>
      </section>

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-card p-3 shadow-md animate-rise" role="toolbar" aria-label="Bulk actions">
          <span className="text-sm font-medium tabular">{selected.size} selected</span>
          <div className="w-72 max-w-full">
            <AccountCombobox
              size="sm"
              value={bulkAccount}
              onChange={(account) => {
                setBulkAccount(account);
                if (account) dispatch({ type: "patch", ids: selectedIds, patch: { account, suggestion: null } });
              }}
              placeholder="Set target account for selected"
              className="w-full max-w-none"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => dispatch({ type: "patch", ids: selectedIds, patch: { include: true } })}>
            Include
          </Button>
          <Button size="sm" variant="outline" onClick={() => dispatch({ type: "patch", ids: selectedIds, patch: { include: false } })}>
            Exclude
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      <div className="animate-rise [animation-delay:60ms]">
        <ImportTable
          views={shown}
          selected={selected}
          showMissing={attempted}
          onSelect={(id, on) =>
            setSelected((prev) => {
              const next = new Set(prev);
              if (on) next.add(id);
              else next.delete(id);
              return next;
            })
          }
          onSelectAll={(on) => setSelected(on ? new Set(shown.map((v) => v.row.id)) : new Set())}
          onPatch={patchOne}
        />
        {views.length > visible && (
          <div className="mt-3 flex justify-center">
            <Button variant="outline" size="sm" onClick={() => setVisible((n) => n + PAGE_SIZE)}>
              Show more ({views.length - visible} remaining)
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border bg-surface px-4 py-3">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm tabular">
          <span>
            <strong>{counts.included}</strong> <span className="text-muted-foreground">included</span>
          </span>
          <span>
            <strong className={counts.duplicates > 0 ? "text-warning" : undefined}>{counts.duplicates}</strong> <span className="text-muted-foreground">duplicates</span>
          </span>
          <span>
            <strong className={counts.invalid > 0 ? "text-negative" : undefined}>{counts.invalid}</strong> <span className="text-muted-foreground">invalid</span>
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeftIcon data-icon="inline-start" /> Back
          </Button>
          <Button
            onClick={() => {
              if (problems.length > 0) {
                setAttempted(true);
                return;
              }
              onContinue();
            }}
          >
            Continue to commit <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
        {attempted && problems.length > 0 && (
          <ul role="alert" className="w-full space-y-0.5 text-sm text-negative">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
