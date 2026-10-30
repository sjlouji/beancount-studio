"use client";

import { LockIcon } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useReducer } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { CommitStep } from "@/components/import/commit-step";
import { initialWizardState, pickSourceAccount, wizardReducer } from "@/components/import/import-state";
import { ReviewStep } from "@/components/import/review-step";
import { Stepper } from "@/components/import/stepper";
import { UploadStep } from "@/components/import/upload-step";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { apiPost, errorMessage } from "@/lib/api/client";
import { ledgerPath, useSystemInfo } from "@/lib/api/hooks";
import type { ColumnMapping, ParsedStatement } from "@/lib/api/types";

const STEPS = [
  { label: "Upload", hint: "Choose a statement" },
  { label: "Review", hint: "Categorise rows" },
  { label: "Commit", hint: "Write to the ledger" },
];

export default function ImportPage() {
  const { workspace, slug, canWrite, meta, attributes } = useLedgerContext();
  const system = useSystemInfo();
  const [state, dispatch] = useReducer(wizardReducer, initialWizardState);

  const parse = useMutation({
    mutationFn: ({ file, mapping }: { file: File; mapping?: ColumnMapping }) => {
      const form = new FormData();
      form.append("file", file);
      if (mapping) form.append("mapping", JSON.stringify(mapping));
      return apiPost<ParsedStatement>(`${ledgerPath(workspace, slug)}/imports/parse`, form);
    },
    onSuccess: (statement, { file, mapping }) => {
      if (mapping) {
        dispatch({ type: "reparsed", statement });
        toast.success(`Re-parsed: ${statement.validCount} valid rows`);
        return;
      }
      dispatch({
        type: "parsed",
        file,
        statement,
        sourceAccount: pickSourceAccount(statement.accounts.length ? statement.accounts : (attributes?.accounts ?? []), meta?.options.nameAssets ?? "Assets", meta?.options.nameLiabilities ?? "Liabilities"),
        currency: statement.detectedCurrency ?? meta?.operatingCurrencies[0] ?? "",
      });
    },
    onError: (err) => toast.error("Couldn't parse the file", { description: errorMessage(err) }),
  });

  if (!canWrite) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Import" title="Bring in a statement" />
        <EmptyState icon={<LockIcon />} title="This ledger is read-only for you" description="Importing writes transactions to the ledger, which needs write access. Ask a workspace admin to change your role." />
      </div>
    );
  }

  const goTo = (step: 0 | 1 | 2) => dispatch({ type: "step", step });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Import"
        title="Bring in a statement"
        description="Upload a bank or card export, check and categorise each row, then commit the new transactions to your ledger in one git commit."
      />
      <Stepper steps={STEPS} current={state.step} onSelect={state.result ? undefined : (i) => goTo(i as 0 | 1 | 2)} />

      {state.step === 0 && (
        <UploadStep
          state={state}
          parsing={parse.isPending}
          error={parse.isError ? parse.error : null}
          onFile={(file) => parse.mutate({ file })}
          onMapping={(mapping) => dispatch({ type: "mapping", mapping })}
          onReparse={() => state.file && state.mapping && parse.mutate({ file: state.file, mapping: state.mapping })}
          onContinue={() => goTo(1)}
        />
      )}
      {state.step === 1 && (
        <ReviewStep state={state} dispatch={dispatch} aiEnabled={system.data?.aiEnabled ?? false} onBack={() => goTo(0)} onContinue={() => goTo(2)} />
      )}
      {state.step === 2 && <CommitStep state={state} dispatch={dispatch} onBack={() => goTo(1)} onReset={() => dispatch({ type: "reset" })} />}
    </div>
  );
}
