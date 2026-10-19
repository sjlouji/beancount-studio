"use client";

import { CheckIcon, ChevronDownIcon, LayoutGridIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { useLedgers, useMe } from "@/lib/api/hooks";
import { NewLedgerDialog } from "./new-ledger-dialog";
import { useLedgerContext } from "./ledger-context";

/** The workspace switcher at the top of the sidebar: bold ledger name plus a chevron, Slack style. */
export function LedgerSwitcher() {
  const { ledger, owner, slug } = useLedgerContext();
  const { data: me } = useMe();
  const { data: ledgers } = useLedgers(Boolean(me));
  const [creating, setCreating] = useState(false);
  const initial = ledger.title.slice(0, 1).toUpperCase();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="h-11 gap-2 px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:justify-center">
              <span className="hidden size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-foreground text-sm font-bold text-primary group-data-[collapsible=icon]:flex">{initial}</span>
              <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate text-[15px] font-bold">{ledger.title}</span>
                <span className="truncate text-xs text-sidebar-muted">
                  {owner}/{slug}
                </span>
              </span>
              <ChevronDownIcon className="size-4 shrink-0 text-sidebar-muted group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start" side="bottom" sideOffset={6}>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Switch ledger</DropdownMenuLabel>
            <DropdownMenuGroup className="max-h-72 overflow-auto scrollbar-thin">
              {(ledgers ?? []).map((item) => (
                <DropdownMenuItem key={item.id} asChild>
                  <Link href={`/ledger/${item.owner}/${item.slug}`} className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-md bg-secondary text-xs font-bold text-primary">
                      {item.title.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="flex-1 truncate">{item.title}</span>
                    {item.id === ledger.id && <CheckIcon className="size-4 text-primary" />}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/ledgers">
                <LayoutGridIcon /> All ledgers
              </Link>
            </DropdownMenuItem>
            {me && (
              <DropdownMenuItem onSelect={() => setCreating(true)}>
                <PlusIcon /> New ledger
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      <NewLedgerDialog open={creating} onOpenChange={setCreating} />
    </SidebarMenu>
  );
}
