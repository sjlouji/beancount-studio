"use client";

import { CheckIcon, ChevronDownIcon, LayoutGridIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LedgerTile } from "@/components/app/sidebar-parts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLedgers, useMe } from "@/lib/api/hooks";
import { NewLedgerDialog } from "./new-ledger-dialog";
import { useLedgerContext } from "./ledger-context";

/** The workspace switcher at the top of the sidebar: ledger name and a chevron, Slack style. */
export function LedgerSwitcher() {
  const { ledger, owner, slug } = useLedgerContext();
  const { data: me } = useMe();
  const { data: ledgers } = useLedgers(Boolean(me));
  const [creating, setCreating] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="press flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/40 data-open:bg-sidebar-accent"
            aria-label={`Ledger: ${ledger.title}. Switch ledger`}
          >
            <LedgerTile title={ledger.title} className="size-6 rounded-md text-[11px]" />
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate type-headline">{ledger.title}</span>
              <span className="truncate type-caption text-sidebar-muted">
                {owner}/{slug}
              </span>
            </span>
            <ChevronDownIcon className="size-4 shrink-0 text-sidebar-muted" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="start" side="bottom" sideOffset={6}>
          <DropdownMenuLabel className="text-xs text-muted-foreground">Switch ledger</DropdownMenuLabel>
          <DropdownMenuGroup className="max-h-72 overflow-auto scrollbar-thin">
            {(ledgers ?? []).map((item) => (
              <DropdownMenuItem key={item.id} asChild>
                <Link href={`/ledger/${item.owner}/${item.slug}`} className="flex items-center gap-2">
                  <LedgerTile title={item.title} className="size-5" />
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
      <NewLedgerDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
