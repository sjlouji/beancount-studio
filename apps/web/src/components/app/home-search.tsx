"use client";

import { HouseIcon, KeyRoundIcon, PlusIcon, Settings2Icon, SettingsIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { create } from "zustand";
import { LedgerTile } from "@/components/app/sidebar-parts";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useCurrentWorkspace } from "@/components/workspace/use-current-workspace";
import { useLedgers, useMe } from "@/lib/api/hooks";
import { ledgerHref, workspaceHref } from "@/lib/routes";

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

/** ⌘K outside a ledger: jump to a ledger in any workspace, or one of the app's pages. */
export function HomeSearch() {
  const { isOpen, setOpen, close } = useHomeSearch();
  const router = useRouter();
  const { data: me } = useMe();
  const { slug, workspace } = useCurrentWorkspace();
  const ledgers = useLedgers(Boolean(me));
  const pages = [
    ...(slug ? [{ label: `${workspace?.name ?? slug} home`, href: workspaceHref(slug), icon: HouseIcon }] : []),
    ...(workspace ? [{ label: "Workspace settings", href: `${workspaceHref(slug)}/settings`, icon: Settings2Icon }] : []),
    { label: "Create a workspace", href: "/new", icon: PlusIcon },
    { label: "Account settings", href: "/settings", icon: SettingsIcon },
    { label: "API keys", href: "/settings/api-keys", icon: KeyRoundIcon },
  ];

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
            {ledgers.data.map((item) => (
              <CommandItem key={item.id} value={`${item.title} ${item.workspace}/${item.slug}`} onSelect={() => go(ledgerHref(item.workspace, item.slug))}>
                <LedgerTile title={item.title} />
                <span className="truncate">{item.title}</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {item.workspace}/{item.slug}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Go to">
          {pages.map((page) => (
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
