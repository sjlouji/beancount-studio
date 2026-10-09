"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckIcon, FileDiffIcon, ShieldAlertIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { useLedgerContext } from "@/components/ledger/ledger-context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { apiPost } from "@/lib/api/client";
import { ledgerPath } from "@/lib/api/hooks";
import type { Projection } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { DiffView } from "@/components/ledger/diff-view";

export interface FileOperation {
  operation: "create" | "update" | "replace" | "delete" | "append";
  path: string;
  content?: string;
  old_string?: string;
  new_string?: string;
}

export interface ApprovalArgs extends Record<string, unknown> {
  description: string;
  files: FileOperation[];
}

export interface ApprovalResult {
  approved: boolean;
  reason?: string;
}

/** Project the assistant's operations into full file contents so the server can diff + check them. */
function projectLocally(files: FileOperation[], current: Record<string, string | null>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const op of files) {
    const base = op.path in out ? out[op.path] : (current[op.path] ?? null);
    switch (op.operation) {
      case "create":
      case "replace":
        out[op.path] = op.content ?? "";
        break;
      case "append": {
        const text = op.content ?? "";
        const prefix = base ?? "";
        const sep = !prefix || prefix.endsWith("\n\n") ? "" : prefix.endsWith("\n") ? "\n" : "\n\n";
        out[op.path] = prefix + sep + text + (text.endsWith("\n") ? "" : "\n");
        break;
      }
      case "update":
        out[op.path] = base !== null && op.old_string !== undefined ? base.replace(op.old_string, op.new_string ?? "") : (base ?? "");
        break;
      case "delete":
        out[op.path] = null;
        break;
    }
  }
  return out;
}

export function ApprovalCard({ args, result, status, addResult }: ToolCallMessagePartProps<ApprovalArgs, ApprovalResult>) {
  const { owner, slug } = useLedgerContext();
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const files = Array.isArray(args.files) ? args.files : [];
  const argsReady = status.type !== "running" && files.length > 0;

  const preview = useQuery<Projection>({
    queryKey: ["approval-preview", owner, slug, JSON.stringify(files)],
    enabled: argsReady,
    queryFn: async () => {
      const paths = Array.from(new Set(files.map((f) => f.path)));
      const current: Record<string, string | null> = {};
      await Promise.all(
        paths.map(async (path) => {
          try {
            const res = await fetch(`/api${ledgerPath(owner, slug)}/files/content?path=${encodeURIComponent(path)}`);
            if (res.status === 404) {
              current[path] = null;
              return;
            }
            const json = (await res.json()) as { content?: string; binary?: boolean };
            current[path] = json.binary ? null : (json.content ?? "");
          } catch {
            current[path] = null;
          }
        }),
      );
      return apiPost<Projection>(`${ledgerPath(owner, slug)}/files/check`, { changes: projectLocally(files, current) });
    },
  });

  const decided = result !== undefined;
  const approved = decided && result?.approved === true;

  return (
    <div className={cn("my-2 overflow-hidden rounded-xl border bg-card card-elevated", approved && "border-positive/40", decided && !approved && "border-muted")}>
      <div className="flex items-start gap-3 border-b bg-surface/60 px-4 py-3">
        <div className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg", approved ? "bg-positive/15 text-positive" : "bg-primary/12 text-primary")}>
          {approved ? <CheckIcon className="size-4" /> : <FileDiffIcon className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{decided ? (approved ? "Approved" : "Rejected") : "The assistant wants to change your ledger"}</div>
          <div className="text-sm text-muted-foreground">{args.description || "…"}</div>
        </div>
      </div>
      <div className="space-y-3 px-4 py-3">
        {!argsReady ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3" /> Preparing changes…
          </div>
        ) : preview.isPending ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3" /> Checking the proposed changes against the ledger…
          </div>
        ) : preview.isError ? (
          <p className="text-xs text-negative">Could not preview: {String(preview.error)}</p>
        ) : (
          <>
            {preview.data.diffs.map((d) => (
              <DiffView key={d.path} path={d.path} diff={d.diff} compact />
            ))}
            {preview.data.errors.length > 0 ? (
              <div className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-xs">
                <div className="mb-1 flex items-center gap-1.5 font-medium">
                  <ShieldAlertIcon className="size-3.5" /> bean-check reports {preview.data.errors.length} {preview.data.errors.length === 1 ? "error" : "errors"} after this change
                </div>
                <ul className="space-y-0.5 font-mono text-[11px]">
                  {preview.data.errors.slice(0, 6).map((e, i) => (
                    <li key={i}>
                      {e.filename}:{e.lineno ?? "?"} — {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-positive">bean-check passes with these changes.</p>
            )}
          </>
        )}
        {!decided && argsReady && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {rejecting ? (
              <form
                className="flex w-full flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addResult({ approved: false, reason: reason.trim() || "Rejected by the user" });
                }}
              >
                <Textarea autoFocus rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What should change? (optional)" className="text-sm" />
                <div className="flex gap-2">
                  <Button type="submit" variant="destructive" size="sm">
                    Reject
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setRejecting(false)}>
                    Back
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <Button size="sm" onClick={() => addResult({ approved: true })} disabled={preview.isPending}>
                  <CheckIcon data-icon="inline-start" /> Approve &amp; commit
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
                  <XIcon data-icon="inline-start" /> Reject
                </Button>
                <span className="text-xs text-muted-foreground">Nothing is written until you approve.</span>
              </>
            )}
          </div>
        )}
        {decided && !approved && result?.reason && <p className="text-xs text-muted-foreground">Reason: {result.reason}</p>}
      </div>
    </div>
  );
}
