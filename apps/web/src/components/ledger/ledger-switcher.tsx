"use client";

import { CheckIcon, ChevronsUpDownIcon, LayoutGridIcon, PlusIcon } from "lucide-react";
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

export function LedgerSwitcher() {
  const { ledger, owner, slug } = useLedgerContext();
  const { data: me } = useMe();
  const { data: ledgers } = useLedgers(Boolean(me));
  const [creating, setCreating] = useState(false);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/12 font-heading text-base text-primary">
                {ledger.title.slice(0, 1).toUpperCase()}
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">{ledger.title}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {owner}/{slug}
                </span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4 opacity-60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start" side="bottom" sideOffset={6}>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Switch ledger</DropdownMenuLabel>
            <DropdownMenuGroup className="max-h-72 overflow-auto scrollbar-thin">
              {(ledgers ?? []).map((item) => (
                <DropdownMenuItem key={item.id} asChild>
                  <Link href={`/ledger/${item.owner}/${item.slug}`} className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded bg-muted font-heading text-xs">
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
