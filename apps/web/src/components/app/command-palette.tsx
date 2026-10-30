"use client";

import {
  LayoutGridIcon,
  ListTreeIcon,
  MoonIcon,
  SunIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { accountHref, useLedgerContext } from "@/components/ledger/ledger-context";
import { LEDGER_SECTIONS } from "@/components/ledger/ledger-nav";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useLedgers, useMe } from "@/lib/api/hooks";

interface PaletteState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useCommandPalette = create<PaletteState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));

const PAGES = LEDGER_SECTIONS.flatMap((section) => section.items);

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const toggle = useCommandPalette((s) => s.toggle);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { data: me } = useMe();
  const { data: ledgers } = useLedgers(Boolean(me));
  const ctx = useLedgerContext();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const accounts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = ctx.attributes?.accounts ?? [];
    if (!needle) return all.slice(0, 8);
    const tokens = needle.split(/[\s:]+/).filter(Boolean);
    return all.filter((a) => tokens.every((t) => a.toLowerCase().includes(t))).slice(0, 12);
  }, [ctx.attributes, query]);

  const go = (href: string) => {
    close();
    router.push(href);
  };

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => (open ? useCommandPalette.getState().open() : close())} title="Command palette" description="Jump to a page, account or ledger">
      <CommandInput placeholder="Jump to a page, account, or ledger…" value={query} onValueChange={setQuery} />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>Nothing matches.</CommandEmpty>
        {accounts.length > 0 && (
          <CommandGroup heading="Accounts">
            {accounts.map((account) => (
              <CommandItem key={account} value={`account ${account}`} onSelect={() => go(accountHref(ctx.base, account, ctx.queryString))} className="font-mono text-xs">
                <ListTreeIcon className="text-muted-foreground" /> {account}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Pages">
          {PAGES.filter((p) => ctx.canWrite || !["/import", "/receipt"].includes(p.path)).map((page) => (
            <CommandItem key={page.path} value={`page ${page.label}`} onSelect={() => go(`${ctx.base}${page.path}${ctx.queryString}`)}>
              <page.icon className="text-muted-foreground" /> {page.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {ledgers && ledgers.length > 1 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Ledgers">
              {ledgers.map((item) => (
                <CommandItem key={item.id} value={`ledger ${item.title} ${item.workspace}/${item.slug}`} onSelect={() => go(`/w/${item.workspace}/${item.slug}`)}>
                  <LayoutGridIcon className="text-muted-foreground" /> {item.title}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {item.workspace}/{item.slug}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        <CommandSeparator />
        <CommandGroup heading="Appearance">
          <CommandItem
            value="toggle theme dark light"
            onSelect={() => {
              setTheme(resolvedTheme === "dark" ? "light" : "dark");
              close();
            }}
          >
            {resolvedTheme === "dark" ? <SunIcon className="text-muted-foreground" /> : <MoonIcon className="text-muted-foreground" />}
            Switch to {resolvedTheme === "dark" ? "light" : "dark"} theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
