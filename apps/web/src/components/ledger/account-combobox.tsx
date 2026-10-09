"use client";

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLedgerAttributes } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";
import { useLedgerContext } from "./ledger-context";

/** Account picker with fuzzy search over the ledger's accounts (and parent prefixes). */
export function AccountCombobox({
  value,
  onChange,
  placeholder = "Select account",
  icon,
  size = "default",
  allowPrefix = false,
  accounts: accountsProp,
  className,
  id,
  disabled,
}: {
  value: string;
  onChange: (account: string) => void;
  placeholder?: string;
  icon?: ReactNode;
  size?: "sm" | "default";
  /** Include parent accounts (e.g. "Expenses:Food") as selectable prefixes. */
  allowPrefix?: boolean;
  accounts?: string[];
  className?: string;
  id?: string;
  disabled?: boolean;
}) {
  const { owner, slug } = useLedgerContext();
  const { data: attributes } = useLedgerAttributes(owner, slug);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const options = useMemo(() => {
    const leaves = accountsProp ?? attributes?.accounts ?? [];
    if (!allowPrefix) return leaves;
    const set = new Set<string>(leaves);
    for (const account of leaves) {
      const parts = account.split(":");
      for (let i = 1; i < parts.length; i++) set.add(parts.slice(0, i).join(":"));
    }
    return Array.from(set).sort();
  }, [accountsProp, attributes, allowPrefix]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options.slice(0, 200);
    const tokens = needle.split(/[\s:]+/).filter(Boolean);
    return options
      .filter((a) => {
        const lower = a.toLowerCase();
        return tokens.every((t) => lower.includes(t));
      })
      .slice(0, 200);
  }, [options, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant={value ? "secondary" : "outline"}
          size={size}
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("justify-between gap-1.5 font-normal", size === "sm" ? "max-w-64" : "w-full", className)}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {icon}
            <span className={cn("truncate", value && "font-mono text-xs")}>{value || placeholder}</span>
          </span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,90vw)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search accounts… (try: exp food)" value={query} onValueChange={setQuery} />
          <CommandList className="max-h-80">
            <CommandEmpty>No account matches.</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  Clear selection
                </CommandItem>
              )}
              {filtered.map((account) => (
                <CommandItem
                  key={account}
                  value={account}
                  onSelect={() => {
                    onChange(account);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="font-mono text-xs"
                >
                  <CheckIcon className={cn("size-3.5", value === account ? "opacity-100" : "opacity-0")} />
                  {account}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
