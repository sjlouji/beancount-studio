"use client";

import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toolbar, ToolbarButton } from "@/components/ui/toolbar";
import { cn } from "@/lib/utils";
import { AccountCombobox } from "./account-combobox";
import { useLedgerContext } from "./ledger-context";

// Quiet text menus, as on apple.com: no border, no icon. Grey while a filter is at its default, the
// label colour once it is set, so the row reads as a sentence of the current scope.
const QUIET = "h-8 gap-1 px-2 font-medium text-muted-foreground hover:text-foreground aria-expanded:text-foreground data-[set=true]:text-foreground";
const QUIET_SELECT = "h-8 w-auto gap-1 border-0 bg-transparent px-2 font-medium text-muted-foreground shadow-none hover:text-foreground data-[state=open]:text-foreground dark:bg-transparent";

const INTERVALS = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "quarter", label: "Quarterly" },
  { value: "year", label: "Yearly" },
] as const;

function yearOptions(years: string[] | undefined): string[] {
  const now = new Date().getFullYear();
  const set = new Set<string>([String(now), String(now - 1)]);
  for (const y of years ?? []) if (/^\d{4}$/.test(y) && Number(y) > 1900) set.add(y);
  return Array.from(set).sort((a, b) => Number(b) - Number(a)).slice(0, 12);
}

function TimeInput() {
  const { params, setParams, attributes } = useLedgerContext();
  const [draft, setDraft] = useState(params.time ?? "");
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const presets: Array<{ label: string; value: string }> = [
    { label: "This month", value: month },
    { label: "This year", value: String(now.getFullYear()) },
    { label: "Last year", value: String(now.getFullYear() - 1) },
    { label: "Last 12 months", value: `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")} - ${month}` },
    { label: "Q1", value: `${now.getFullYear()}-Q1` },
    { label: "Q2", value: `${now.getFullYear()}-Q2` },
    { label: "Q3", value: `${now.getFullYear()}-Q3` },
    { label: "Q4", value: `${now.getFullYear()}-Q4` },
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <ToolbarButton variant="ghost" size="sm" data-set={Boolean(params.time)} className={QUIET}>
          {params.time || "All time"}
          <ChevronDownIcon className="size-3.5 opacity-60" />
        </ToolbarButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setParams({ time: draft.trim() || undefined });
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="2026, 2026-03, 2026-Q1, 2025 - 2026…"
            className="font-mono text-xs"
            aria-label="Time filter"
          />
          <Button type="submit" size="sm">
            Apply
          </Button>
        </form>
        <div className="mt-3 grid grid-cols-2 gap-1">
          {presets.map((p) => (
            <Button key={p.value} variant="ghost" size="sm" className="justify-start font-normal" onClick={() => setParams({ time: p.value })}>
              {p.label}
            </Button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1 border-t pt-2">
          {yearOptions(attributes?.years).map((y) => (
            <Button key={y} variant={params.time === y ? "secondary" : "ghost"} size="xs" className="font-mono" onClick={() => setParams({ time: y })}>
              {y}
            </Button>
          ))}
          {params.time && (
            <Button variant="ghost" size="xs" className="ml-auto text-muted-foreground" onClick={() => setParams({ time: undefined })}>
              Clear
            </Button>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Fava syntax: a year, month, quarter (<Kbd>2026-Q2</Kbd>), week (<Kbd>2026-W10</Kbd>) or a range with <Kbd>-</Kbd> / <Kbd>to</Kbd>.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function AdvancedFilter() {
  const { params, setParams } = useLedgerContext();
  const [draft, setDraft] = useState(params.filter ?? "");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <ToolbarButton variant="ghost" size="sm" data-set={Boolean(params.filter)} className={QUIET}>
          {params.filter ? <span className="max-w-40 truncate font-mono text-xs">{params.filter}</span> : "Filter"}
          <ChevronDownIcon className="size-3.5 opacity-60" />
        </ToolbarButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-3">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setParams({ filter: draft.trim() || undefined });
          }}
        >
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder='#tag ^link payee:"Chase" -#vacation' className="font-mono text-xs" aria-label="Advanced filter" />
          <Button type="submit" size="sm">
            Apply
          </Button>
        </form>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Tags <Kbd>#trip</Kbd>, links <Kbd>^invoice</Kbd>, <Kbd>payee:&quot;…&quot;</Kbd>, <Kbd>narration:&quot;…&quot;</Kbd>, metadata <Kbd>key:&quot;value&quot;</Kbd>, negate with <Kbd>-</Kbd>, combine with <Kbd>any(…)</Kbd> / <Kbd>all(…)</Kbd>.
        </p>
      </PopoverContent>
    </Popover>
  );
}

export function FilterBar({ className, showInterval = true, showConversion = true }: { className?: string; showInterval?: boolean; showConversion?: boolean }) {
  const { params, setParams, clearFilters, hasFilters, meta, attributes, conversion } = useLedgerContext();
  const currencies = attributes?.currencies ?? meta?.operatingCurrencies ?? [];
  const operating = meta?.operatingCurrencies ?? [];
  return (
    <Toolbar aria-label="Report filters" className={cn("gap-0.5", className)}>
      <TimeInput key={`time:${params.time ?? ""}`} />
      <ToolbarButton asChild>
        <AccountCombobox
          value={params.account ?? ""}
          onChange={(account) => setParams({ account: account || undefined })}
          placeholder="All accounts"
          size="sm"
          variant="ghost"
          data-set={Boolean(params.account)}
          className={QUIET}
          allowPrefix
        />
      </ToolbarButton>
      <AdvancedFilter key={`filter:${params.filter ?? ""}`} />
      {hasFilters && (
        <ToolbarButton variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2 font-medium text-link hover:text-link-hover">
          Clear
        </ToolbarButton>
      )}
      <div className="ml-auto flex items-center gap-2">
        {showInterval && (
          <Select value={params.interval ?? "month"} onValueChange={(v) => setParams({ interval: v === "month" ? undefined : v })}>
            <ToolbarButton asChild>
              <SelectTrigger size="sm" className={QUIET_SELECT} aria-label="Interval">
                <SelectValue />
              </SelectTrigger>
            </ToolbarButton>
            <SelectContent>
              {INTERVALS.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {showConversion && (
          <Select value={conversion} onValueChange={(v) => setParams({ conversion: v === operating[0] ? undefined : v })}>
            <ToolbarButton asChild>
              <SelectTrigger size="sm" className={QUIET_SELECT} aria-label="Conversion">
                <SelectValue />
              </SelectTrigger>
            </ToolbarButton>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Convert to</SelectLabel>
                {currencies.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Other</SelectLabel>
                <SelectItem value="at_cost">At cost</SelectItem>
                <SelectItem value="at_value">At market value</SelectItem>
                <SelectItem value="units">Units</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </div>
    </Toolbar>
  );
}
