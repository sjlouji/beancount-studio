"use client";

import { HouseIcon, KeyRoundIcon, SettingsIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { create } from "zustand";
import { LedgerTile } from "@/components/app/sidebar-parts";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useLedgers, useMe } from "@/lib/api/hooks";

interface HomeSearchState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  setOpen: (open: boolean) => void;
}

export const useHomeSearch = create<HomeSearchState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setOpen: (isOpen) => set({ isOpen }),
}));

const PAGES = [
  { label: "Home", href: "/ledgers", icon: HouseIcon },
  { label: "Settings", href: "/settings", icon: SettingsIcon },
  { label: "API keys", href: "/settings/api-keys", icon: KeyRoundIcon },
];

/** ⌘K outside a ledger: jump to a ledger or one of the app's pages. */
export function HomeSearch() {
  const { isOpen, setOpen, close } = useHomeSearch();
  const router = useRouter();
  const { data: me } = useMe();
  const ledgers = useLedgers(Boolean(me));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(!useHomeSearch.getState().isOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const go = (href: string) => {
    close();
    router.push(href);
  };

  return (
    <CommandDialog open={isOpen} onOpenChange={setOpen} title="Search" description="Jump to a ledger or page">
      <CommandInput placeholder="Find a ledger or page…" />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        {ledgers.data && ledgers.data.length > 0 && (
          <CommandGroup heading="Ledgers">
            {ledgers.data.map((l) => (
              <CommandItem key={l.id} value={`${l.title} ${l.owner}/${l.slug}`} onSelect={() => go(`/ledger/${l.owner}/${l.slug}`)}>
                <LedgerTile title={l.title} />
                <span className="truncate">{l.title}</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {l.owner}/{l.slug}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Go to">
          {PAGES.map((page) => (
            <CommandItem key={page.href} value={page.label} onSelect={() => go(page.href)}>
              <page.icon />
              {page.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
