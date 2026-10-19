"use client";

import { AlertCircleIcon, CopyIcon, SparklesIcon, HistoryIcon } from "lucide-react";
import { AccountCombobox } from "@/components/ledger/account-combobox";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ReviewRow, RowView } from "./import-state";

function SuggestionBadge({ suggestion }: { suggestion: NonNullable<ReviewRow["suggestion"]> }) {
  const Icon = suggestion.source === "ai" ? SparklesIcon : HistoryIcon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="shrink-0 gap-1 tabular">
          <Icon className="size-3" />
          {suggestion.source === "ai" ? "AI" : "history"} {Math.round(suggestion.confidence * 100)}%
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{suggestion.reasoning || `Suggested from ${suggestion.source === "ai" ? "the AI model" : "your payee history"}`}</TooltipContent>
    </Tooltip>
  );
}

function StatusCell({ view }: { view: RowView }) {
  if (view.invalid) {
    const reason = view.row.errors[0] ?? "Missing or unreadable date or amount";
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="destructive" className="gap-1">
            <AlertCircleIcon className="size-3" /> Invalid
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{reason}</TooltipContent>
      </Tooltip>
    );
  }
  if (view.duplicate) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="gap-1 text-warning">
            <CopyIcon className="size-3" /> Duplicate
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">The ledger already has a transaction on this date with this amount in the source account.</TooltipContent>
      </Tooltip>
    );
  }
  return <span className="text-xs text-muted-foreground">New</span>;
}

export function ImportTable({
  views,
  selected,
  onSelect,
  onSelectAll,
  onPatch,
  showMissing,
}: {
  views: RowView[];
  selected: Set<number>;
  onSelect: (id: number, on: boolean) => void;
  onSelectAll: (on: boolean) => void;
  onPatch: (id: number, patch: Partial<Omit<ReviewRow, "id">>) => void;
  /** Highlight included rows that still lack a target account. */
  showMissing: boolean;
}) {
  const allSelected = views.length > 0 && views.every((v) => selected.has(v.row.id));
  const someSelected = !allSelected && views.some((v) => selected.has(v.row.id));

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table className="min-w-[1080px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox checked={allSelected ? true : someSelected ? "indeterminate" : false} onCheckedChange={(on) => onSelectAll(on === true)} aria-label="Select all rows" />
            </TableHead>
            <TableHead className="w-16">Include</TableHead>
            <TableHead className="w-40">Date</TableHead>
            <TableHead className="w-48">Payee</TableHead>
            <TableHead className="min-w-52">Narration</TableHead>
            <TableHead className="w-32 text-right">Amount</TableHead>
            <TableHead className="w-80">Target account</TableHead>
            <TableHead className="w-28">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {views.map((view) => {
            const { row } = view;
            const missing = showMissing && view.included && !row.account;
            const amount = Number(row.amount);
            return (
              <TableRow key={row.id} data-state={selected.has(row.id) ? "selected" : undefined} className={cn(!view.included && "opacity-60")}>
                <TableCell>
                  <Checkbox checked={selected.has(row.id)} onCheckedChange={(on) => onSelect(row.id, on === true)} aria-label={`Select row ${row.id + 1}`} />
                </TableCell>
                <TableCell>
                  <Switch size="sm" checked={view.included} disabled={view.invalid} onCheckedChange={(on) => onPatch(row.id, { include: on })} aria-label={`Include row ${row.id + 1}`} />
                </TableCell>
                <TableCell>
                  <Input type="date" value={row.date} onChange={(e) => onPatch(row.id, { date: e.target.value })} aria-label="Date" aria-invalid={view.invalid && !row.date ? true : undefined} className="h-8 tabular" />
                </TableCell>
                <TableCell>
                  <Input value={row.payee} onChange={(e) => onPatch(row.id, { payee: e.target.value })} aria-label="Payee" className="h-8" />
                </TableCell>
                <TableCell>
                  <Input value={row.narration} onChange={(e) => onPatch(row.id, { narration: e.target.value })} aria-label="Narration" className="h-8" />
                </TableCell>
                <TableCell className={cn("text-right font-mono text-[13px] tabular", Number.isFinite(amount) && amount < 0 && "text-negative", Number.isFinite(amount) && amount > 0 && "text-positive")}>
                  {row.amount || "–"}
                  <span className="ml-1 text-[0.8em] text-muted-foreground">{view.currency}</span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <AccountCombobox
                      size="sm"
                      value={row.account}
                      onChange={(account) => onPatch(row.id, { account, suggestion: null })}
                      placeholder="Choose account"
                      className={cn("min-w-0 flex-1", missing && "border-negative text-negative")}
                    />
                    {row.suggestion && row.account && <SuggestionBadge suggestion={row.suggestion} />}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusCell view={view} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
