"use client";

import { ArrowRightIcon, FileTextIcon } from "lucide-react";
import { useState } from "react";
import { ErrorState } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ColumnMapping } from "@/lib/api/types";
import { pluralize } from "@/lib/format";
import { Dropzone } from "./dropzone";
import type { WizardState } from "./import-state";
import { MappingPanel } from "./mapping-panel";

export const STATEMENT_ACCEPT = ".csv,.ofx,.qfx,.qif,.txt";

const FORMATS = [
  { name: "CSV", detail: "Any bank export with a header row" },
  { name: "OFX / QFX", detail: "Open Financial Exchange downloads" },
  { name: "QIF", detail: "Quicken Interchange Format" },
];

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-surface px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular">{value}</div>
    </div>
  );
}

export function UploadStep({
  state,
  parsing,
  error,
  onFile,
  onMapping,
  onReparse,
  onContinue,
}: {
  state: WizardState;
  parsing: boolean;
  error: unknown;
  onFile: (file: File) => void;
  onMapping: (mapping: ColumnMapping) => void;
  onReparse: () => void;
  onContinue: () => void;
}) {
  const { statement, mapping } = state;
  const [mappingDirty, setMappingDirty] = useState(false);

  return (
    <div className="space-y-5">
      <div className="animate-rise [animation-delay:120ms]">
        <Dropzone
          accept={STATEMENT_ACCEPT}
          onFile={onFile}
          busy={parsing && !statement}
          busyLabel="Reading statement…"
          compact={statement !== null}
          title={statement ? "Drop a different file to start over" : "Drop a bank statement here, or click to choose"}
          hint={
            <span className="flex flex-wrap items-center justify-center gap-1.5">
              {FORMATS.map((f) => (
                <Badge key={f.name} variant="outline" title={f.detail}>
                  {f.name}
                </Badge>
              ))}
              <span className="w-full">.csv .ofx .qfx .qif .txt. Nothing is written until you commit in step 3.</span>
            </span>
          }
        />
      </div>

      {error != null && <ErrorState error={error} title="Couldn't read that file" />}

      {statement && mapping && (
        <>
          <section className="rounded-xl border bg-card p-5 card-elevated animate-rise">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileTextIcon className="size-4 text-muted-foreground" />
              <span className="truncate">{statement.filename}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryStat label="Format" value={statement.format.toUpperCase()} />
              <SummaryStat label="Rows found" value={String(statement.rows.length)} />
              <SummaryStat label="Valid rows" value={`${statement.validCount} of ${statement.rows.length}`} />
              <SummaryStat label="Detected currency" value={statement.detectedCurrency ?? "Not detected"} />
            </div>
            {statement.validCount === 0 && (
              <p className="mt-3 text-sm text-warning">
                No valid rows yet. {statement.format === "csv" ? "Check the column mapping below and re-parse." : "This file has no readable transactions."}
              </p>
            )}
          </section>

          {statement.format === "csv" && (
            <MappingPanel
              headers={statement.headers}
              mapping={mapping}
              dirty={mappingDirty}
              busy={parsing}
              onChange={(next) => {
                setMappingDirty(true);
                onMapping(next);
              }}
              onReparse={() => {
                setMappingDirty(false);
                onReparse();
              }}
            />
          )}

          <div className="flex items-center justify-end gap-3">
            <span className="text-sm text-muted-foreground tabular">
              {pluralize(statement.validCount, "transaction")} ready to review
            </span>
            <Button onClick={onContinue} disabled={statement.rows.length === 0 || parsing}>
              Continue to review <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
