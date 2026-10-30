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
import { errorMessage } from "@/lib/api/client";
import { useMe, useWorkspaceLedgers } from "@/lib/api/hooks";
import { ledgerHref, workspaceHref } from "@/lib/routes";
import { NewLedgerDialog } from "./new-ledger-dialog";
import { useLedgerContext } from "./ledger-context";

/** The ledger row under the workspace switcher: the ledger's name and a menu of the workspace's other ledgers. */
export function LedgerSwitcher() {
  const { ledger, workspace } = useLedgerContext();
  const { data: me } = useMe();
  const ledgers = useWorkspaceLedgers(workspace, Boolean(me));
  const [creating, setCreating] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="press flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/40 data-open:bg-sidebar-accent"
            aria-label={`Ledger: ${ledger.title}. Switch ledger`}
          >
            <LedgerTile title={ledger.title} className="size-5 text-[10px]" />
            <span className="min-w-0 flex-1 truncate type-subhead font-medium">{ledger.title}</span>
            <ChevronDownIcon className="size-4 shrink-0 text-sidebar-muted" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="start" side="bottom" sideOffset={6}>
          <DropdownMenuLabel className="text-xs text-muted-foreground">Ledgers in this workspace</DropdownMenuLabel>
          <DropdownMenuGroup className="max-h-72 overflow-auto scrollbar-thin">
            {ledgers.isError && (
              <DropdownMenuItem disabled className="text-negative">
                {errorMessage(ledgers.error)}
              </DropdownMenuItem>
            )}
            {(ledgers.data ?? [ledger]).map((item) => (
              <DropdownMenuItem key={item.id} asChild>
                <Link href={ledgerHref(item.workspace, item.slug)} className="flex items-center gap-2">
                  <LedgerTile title={item.title} className="size-5" />
                  <span className="flex-1 truncate">{item.title}</span>
                  {item.id === ledger.id && <CheckIcon className="size-4 text-primary" />}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={workspaceHref(workspace)}>
              <LayoutGridIcon /> Workspace home
            </Link>
          </DropdownMenuItem>
          {ledger.canWrite && (
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
