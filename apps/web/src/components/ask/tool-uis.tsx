"use client";

import { CheckCircle2Icon, DatabaseIcon, FileSearchIcon, FileTextIcon, FolderTreeIcon, ListTreeIcon, ScrollTextIcon, XCircleIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { DiffView } from "@/components/ledger/diff-view";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

function Shell({ icon, title, status, children, error }: { icon: ReactNode; title: ReactNode; status: ToolCallMessagePartProps["status"]; children?: ReactNode; error?: boolean }) {
  const running = status.type === "running" || status.type === "requires-action";
  return (
    <div className={cn("my-1.5 rounded-lg border bg-surface/50 text-xs", error && "border-negative/40")}>
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className={cn("text-muted-foreground", error && "text-negative")}>{icon}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        {running ? <Spinner className="size-3 text-muted-foreground" /> : error ? <XCircleIcon className="size-3.5 text-negative" /> : <CheckCircle2Icon className="size-3.5 text-positive" />}
      </div>
      {children && <div className="border-t px-3 py-2">{children}</div>}
    </div>
  );
}

type Rows = Array<Array<unknown>>;

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("units" in obj && obj.units && typeof obj.units === "object") {
      const u = obj.units as { number: number; currency: string };
      return `${u.number} ${u.currency}`;
    }
    return Object.entries(obj)
      .map(([k, v]) => `${v} ${k}`)
      .join(", ");
  }
  return String(value);
}

export function BqlToolUI({ args, result, status }: ToolCallMessagePartProps<{ query: string }, { columns?: string[]; rows?: Rows; rowCount?: number; truncated?: boolean; text?: string; error?: string }>) {
  const error = Boolean(result?.error);
  return (
    <Shell icon={<DatabaseIcon className="size-3.5" />} title={<span className="font-mono">{args.query ?? "BQL query"}</span>} status={status} error={error}>
      {result?.error && <p className="text-negative">{result.error}</p>}
      {result?.text && <pre className="max-h-60 overflow-auto font-mono text-[11px] whitespace-pre">{result.text}</pre>}
      {result?.columns && result.rows && (
        <div className="max-h-64 overflow-auto scrollbar-thin">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-surface">
              <tr>
                {result.columns.map((c) => (
                  <th key={c} className="px-1.5 py-1 text-left font-medium text-muted-foreground">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, 50).map((row, i) => (
                <tr key={i} className="border-t">
                  {row.map((v, j) => (
                    <td key={j} className={cn("px-1.5 py-0.5 font-mono", typeof v === "number" && "text-right tabular")}>
                      {cell(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-muted-foreground">
            {result.rowCount ?? result.rows.length} rows{result.truncated ? " (truncated)" : ""}
            {result.rows.length > 50 ? ", showing 50" : ""}
          </p>
        </div>
      )}
    </Shell>
  );
}

export function ReadFileToolUI({ args, result, status }: ToolCallMessagePartProps<{ path: string; start_line?: number; end_line?: number }, { content?: string; totalLines?: number; startLine?: number; endLine?: number; error?: string }>) {
  return (
    <Shell icon={<FileTextIcon className="size-3.5" />} title={<span className="font-mono">{args.path}{args.start_line ? `:${args.start_line}${args.end_line ? `-${args.end_line}` : ""}` : ""}</span>} status={status} error={Boolean(result?.error)}>
      {result?.error ? <p className="text-negative">{result.error}</p> : result?.content ? <pre className="max-h-56 overflow-auto font-mono text-[11px] whitespace-pre">{result.content}</pre> : null}
    </Shell>
  );
}

export function ListFilesToolUI({ result, status }: ToolCallMessagePartProps<Record<string, never>, { files?: string[]; error?: string }>) {
  return (
    <Shell icon={<FolderTreeIcon className="size-3.5" />} title="Listed ledger files" status={status} error={Boolean(result?.error)}>
      {result?.files && <pre className="max-h-40 overflow-auto font-mono text-[11px]">{result.files.join("\n")}</pre>}
    </Shell>
  );
}

export function SummaryToolUI({ result, status }: ToolCallMessagePartProps<Record<string, never>, { title?: string; accounts?: string[]; transactionsCount?: number; error?: string }>) {
  return <Shell icon={<ListTreeIcon className="size-3.5" />} title={result?.title ? `Read ledger summary · ${result.accounts?.length ?? 0} accounts, ${result.transactionsCount ?? 0} transactions` : "Reading ledger summary"} status={status} error={Boolean(result?.error)} />;
}

export function SearchToolUI({ args, result, status }: ToolCallMessagePartProps<{ text: string }, { total?: number; transactions?: Array<{ date: string; payee?: string; narration?: string; postings: string[] }>; error?: string }>) {
  return (
    <Shell icon={<FileSearchIcon className="size-3.5" />} title={`Searched transactions for “${args.text}”${result?.total !== undefined ? ` · ${result.total} match${result.total === 1 ? "" : "es"}` : ""}`} status={status} error={Boolean(result?.error)}>
      {result?.transactions && result.transactions.length > 0 && (
        <ul className="max-h-48 space-y-1 overflow-auto font-mono text-[11px]">
          {result.transactions.slice(0, 20).map((t, i) => (
            <li key={i}>
              {t.date} {t.payee ? `"${t.payee}" ` : ""}
              {t.narration ? `"${t.narration}"` : ""} — {t.postings.join(" · ")}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

export function ReportToolUI({ args, result, status }: ToolCallMessagePartProps<{ report: string; time?: string }, { summary?: string; error?: string }>) {
  return (
    <Shell icon={<ScrollTextIcon className="size-3.5" />} title={`${args.report?.replace("_", " ")}${args.time ? ` · ${args.time}` : ""}`} status={status} error={Boolean(result?.error)}>
      {result?.summary && <pre className="max-h-56 overflow-auto font-mono text-[11px] whitespace-pre">{result.summary}</pre>}
    </Shell>
  );
}

export function CheckEditToolUI({ result, status }: ToolCallMessagePartProps<{ files: Array<{ path: string }> }, { diffs?: Array<{ path: string; diff: string }>; newErrors?: Array<{ message: string }>; errorsAfter?: number; error?: string }>) {
  return (
    <Shell icon={<FileSearchIcon className="size-3.5" />} title={result?.error ? "Edit check failed" : result ? `Checked a proposed edit · ${result.newErrors?.length ?? 0} new ${result.newErrors?.length === 1 ? "error" : "errors"}` : "Checking a proposed edit"} status={status} error={Boolean(result?.error)}>
      {result?.error && <p className="text-negative">{result.error}</p>}
      {result?.diffs?.map((d) => (
        <DiffView key={d.path} path={d.path} diff={d.diff} compact defaultOpen={false} className="my-1" />
      ))}
    </Shell>
  );
}

export function EditFilesToolUI({ args, result, status }: ToolCallMessagePartProps<{ description: string; files: Array<{ path: string; operation: string }> }, { committed?: boolean; commit?: string | null; files?: string[]; newErrors?: Array<{ message: string }>; error?: string; message?: string }>) {
  const error = Boolean(result?.error);
  return (
    <Shell icon={<CheckCircle2Icon className="size-3.5" />} title={result?.committed ? `Committed: ${args.description}` : error ? "Edit was not applied" : `Applying: ${args.description}`} status={status} error={error}>
      {result?.committed && (
        <p className="text-muted-foreground">
          Commit <span className="font-mono">{result.commit?.slice(0, 7)}</span> · {result.files?.join(", ")}
          {result.newErrors && result.newErrors.length > 0 && <span className="text-warning-foreground"> · {result.newErrors.length} new bean-check errors</span>}
        </p>
      )}
      {error && <p className="text-negative">{result?.message ?? result?.error}</p>}
    </Shell>
  );
}
