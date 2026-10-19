"use client";

import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { ColumnMapping } from "@/lib/api/types";

type RoleKey = Exclude<keyof ColumnMapping, "invert_amount">;

const ROLES: Array<{ key: RoleKey; label: string; hint: string }> = [
  { key: "date", label: "Date", hint: "Transaction date" },
  { key: "amount", label: "Amount", hint: "Signed single column" },
  { key: "debit", label: "Debit", hint: "Money out column" },
  { key: "credit", label: "Credit", hint: "Money in column" },
  { key: "payee", label: "Payee", hint: "Merchant or counterparty" },
  { key: "description", label: "Description", hint: "Becomes the narration" },
  { key: "balance", label: "Balance", hint: "Running balance (ignored)" },
];

const NONE = "__none__";

export function MappingPanel({
  headers,
  mapping,
  onChange,
  onReparse,
  busy,
  dirty,
}: {
  headers: string[];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
  onReparse: () => void;
  busy: boolean;
  dirty: boolean;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 animate-rise [animation-delay:60ms]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Column mapping</h2>
          <p className="mt-1 text-sm text-muted-foreground">We guessed these from the headers. Adjust any that look wrong, then re-parse.</p>
        </div>
        <Button size="sm" variant={dirty ? "default" : "outline"} onClick={onReparse} disabled={busy}>
          {busy ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
          Re-parse with this mapping
        </Button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map(({ key, label, hint }) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`map-${key}`}>{label}</Label>
            <Select value={mapping[key] ?? NONE} onValueChange={(v) => onChange({ ...mapping, [key]: v === NONE ? null : v })}>
              <SelectTrigger id={`map-${key}`} className="w-full" aria-label={`${label} column`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {headers.map((header) => (
                  <SelectItem key={header} value={header}>
                    {header}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
        ))}
        <div className="flex items-start gap-3 rounded-lg border bg-surface p-3 sm:col-span-2 lg:col-span-1">
          <Switch id="map-invert" checked={mapping.invert_amount} onCheckedChange={(on) => onChange({ ...mapping, invert_amount: on })} />
          <div className="space-y-0.5">
            <Label htmlFor="map-invert">Invert amounts</Label>
            <p className="text-xs text-muted-foreground">Flip signs when spending is shown as positive (credit cards).</p>
          </div>
        </div>
      </div>
    </section>
  );
}
