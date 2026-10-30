"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeftIcon, CheckCircle2Icon, GitCommitHorizontalIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type Dispatch } from "react";
import { toast } from "sonner";
import { Amount } from "@/components/app/amount";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { apiPost, errorMessage } from "@/lib/api/client";
import { ledgerPath, useInvalidateLedger } from "@/lib/api/hooks";
import type { ImportCommitResult } from "@/lib/api/types";
import { formatDate, pluralize } from "@/lib/format";
import { buildExistingKeySet, deriveRows, type WizardAction, type WizardState } from "./import-state";

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-surface px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular">{children}</div>
    </div>
  );
}

export function CommitStep({ state, dispatch, onBack, onReset }: { state: WizardState; dispatch: Dispatch<WizardAction>; onBack: () => void; onReset: () => void }) {
  const { workspace, slug, base, meta, precisions } = useLedgerContext();
  const invalidate = useInvalidateLedger(workspace, slug);
  const { statement, rows, sourceAccount, currency, result } = state;

  const included = useMemo(
    () => deriveRows(rows, buildExistingKeySet(statement?.existingKeys ?? []), sourceAccount, currency).filter((v) => v.included),
    [rows, statement, sourceAccount, currency],
  );
  const summary = useMemo(() => {
    const dates = included.map((v) => v.row.date).sort();
    let moneyIn = 0;
    let moneyOut = 0;
    for (const v of included) {
      const n = Number(v.row.amount);
      if (n > 0) moneyIn += n;
      else moneyOut += n;
    }
    return { first: dates[0], last: dates[dates.length - 1], moneyIn, moneyOut };
  }, [included]);

  const defaultFile = meta?.favaOptions.defaultFile ?? "main.bean";
  const files = useMemo(() => {
    const list = meta?.sourceFiles ?? [];
    return list.includes(defaultFile) ? list : [defaultFile, ...list];
  }, [meta, defaultFile]);
  const [filename, setFilename] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const chosenFile = filename ?? defaultFile;
  const chosenMessage = message ?? `Import ${included.length} transactions`;

  const commit = useMutation({
    mutationFn: () =>
      apiPost<ImportCommitResult>(`${ledgerPath(workspace, slug)}/imports/commit`, {
        rows: included.map((v) => ({
          id: v.row.id,
          date: v.row.date,
          payee: v.row.payee,
          narration: v.row.narration,
          amount: v.row.amount,
          currency: v.currency,
          targetAccount: v.row.account,
        })),
        sourceAccount,
        filename: chosenFile,
        message: chosenMessage.trim() || undefined,
        skipDuplicates,
      }),
    onSuccess: (data) => {
      dispatch({ type: "committed", result: data });
      invalidate();
      toast.success(`Imported ${pluralize(data.written, "transaction")}`);
    },
    onError: (err) => toast.error("Import failed", { description: errorMessage(err) }),
  });

  if (result) {
    return (
      <section className="space-y-5 rounded-xl border bg-card p-6 animate-rise">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-positive/10 text-positive">
            <CheckCircle2Icon className="size-5" />
          </span>
          <div>
            <h2 className="font-medium">{result.written === 0 ? "Nothing was written" : `Imported ${pluralize(result.written, "transaction")}`}</h2>
            <p className="text-sm text-muted-foreground">
              {result.written === 0 ? "Every row was skipped as a duplicate." : <>Added to <span className="font-mono text-[13px]">{result.file ?? chosenFile}</span> and committed.</>}
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Written">{result.written}</Stat>
          <Stat label="Skipped as duplicates">{result.skipped.length}</Stat>
          <Stat label="Commit">{result.commit ? <span className="font-mono text-base">{result.commit.slice(0, 8)}</span> : "–"}</Stat>
        </div>
        {result.skipped.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Skipped row ids: <span className="font-mono tabular">{result.skipped.join(", ")}</span>
          </p>
        )}
        {result.errors.length > 0 && (
          <div role="alert" className="rounded-lg border border-warning/40 bg-warning/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-warning">
              <TriangleAlertIcon className="size-4" /> The ledger reports {pluralize(result.errors.length, "error")} after this import
            </div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {result.errors.slice(0, 20).map((err, i) => (
                <li key={`${err.filename}-${err.lineno}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
                  <span>{err.message}</span>
                  {err.filename && (
                    <Link href={`${base}/files/edit?path=${encodeURIComponent(err.filename)}${err.lineno ? `&line=${err.lineno}` : ""}`} className="font-mono text-xs text-primary underline-offset-2 hover:underline">
                      {err.filename}
                      {err.lineno ? `:${err.lineno}` : ""}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`${base}/journal`}>Open journal</Link>
          </Button>
          <Button variant="outline" onClick={onReset}>
            Import another file
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-card p-5 animate-rise">
        <h2 className="text-sm font-medium">Summary</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Transactions">{included.length}</Stat>
          <Stat label="Date range">
            <span className="text-base">{summary.first ? (summary.first === summary.last ? formatDate(summary.first) : `${formatDate(summary.first)} to ${formatDate(summary.last)}`) : "–"}</span>
          </Stat>
          <Stat label="Money in">
            <Amount value={summary.moneyIn} currency={currency} precisions={precisions} colored />
          </Stat>
          <Stat label="Money out">
            <Amount value={summary.moneyOut} currency={currency} precisions={precisions} colored />
          </Stat>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          From <span className="font-mono text-[13px]">{sourceAccount}</span>
        </p>
      </section>

      <section className="grid gap-4 rounded-xl border bg-card p-5 animate-rise [animation-delay:60ms] md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="target-file">Target file</Label>
          <Select value={chosenFile} onValueChange={setFilename}>
            <SelectTrigger id="target-file" className="w-full font-mono text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {files.map((f) => (
                <SelectItem key={f} value={f} className="font-mono text-[13px]">
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="commit-message">Commit message</Label>
          <Input id="commit-message" value={chosenMessage} onChange={(e) => setMessage(e.target.value)} />
        </div>
        <Label htmlFor="skip-dupes" className="flex cursor-pointer items-start gap-3 md:col-span-2">
          <Checkbox id="skip-dupes" checked={skipDuplicates} onCheckedChange={(on) => setSkipDuplicates(on === true)} className="mt-0.5" />
          <span className="space-y-0.5">
            <span className="block">Skip duplicates</span>
            <span className="block text-xs font-normal text-muted-foreground">The server re-checks date, source account, amount and currency against the ledger and skips matches.</span>
          </span>
        </Label>
      </section>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} disabled={commit.isPending}>
          <ArrowLeftIcon data-icon="inline-start" /> Back to review
        </Button>
        <Button onClick={() => commit.mutate()} disabled={commit.isPending || included.length === 0 || !meta}>
          {commit.isPending ? <Spinner data-icon="inline-start" /> : <GitCommitHorizontalIcon data-icon="inline-start" />}
          {commit.isPending ? "Committing…" : "Commit to ledger"}
        </Button>
      </div>
    </div>
  );
}
