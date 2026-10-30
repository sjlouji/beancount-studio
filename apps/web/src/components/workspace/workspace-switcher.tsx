"use client";

import { CheckIcon, ChevronDownIcon, PlusIcon, Settings2Icon, UserPlusIcon } from "lucide-react";
import Link from "next/link";
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
import { useMe } from "@/lib/api/hooks";
import { workspaceHref } from "@/lib/routes";
import { ROLE_LABELS, canAdminister } from "./rules";
import { useCurrentWorkspace } from "./use-current-workspace";

/** The workspace name at the top of the sidebar, Slack style: a menu to switch, create or manage. */
export function WorkspaceSwitcher() {
  const { data: me } = useMe();
  const { slug, workspace, workspaces } = useCurrentWorkspace();
  const name = workspace?.name ?? (slug || "Beancount Studio");
  const label = (
    <span className="grid min-w-0 flex-1 leading-tight">
      <span className="truncate type-headline">{name}</span>
      {workspace && (
        <span className="truncate type-caption text-sidebar-muted">
          {ROLE_LABELS[workspace.role]} · /w/{workspace.slug}
        </span>
      )}
    </span>
  );

  // Visitors reading a public ledger have no workspaces to switch between.
  if (!me) {
    return (
      <div className="flex h-9 min-w-0 flex-1 items-center gap-2 px-2">
        <LedgerTile title={name} className="size-6 rounded-md text-[11px]" />
        {label}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="press flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/40 data-open:bg-sidebar-accent"
          aria-label={`Workspace: ${name}. Switch workspace`}
        >
          <LedgerTile title={name} className="size-6 rounded-md text-[11px]" />
          {label}
          <ChevronDownIcon className="size-4 shrink-0 text-sidebar-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start" side="bottom" sideOffset={6}>
        <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
        <DropdownMenuGroup className="max-h-72 overflow-auto scrollbar-thin">
          {workspaces.isPending && <DropdownMenuItem disabled>Loading…</DropdownMenuItem>}
          {workspaces.isError && (
            <DropdownMenuItem disabled className="text-negative">
              {errorMessage(workspaces.error)}
            </DropdownMenuItem>
          )}
          {(workspaces.data ?? []).map((item) => (
            <DropdownMenuItem key={item.id} asChild>
              <Link href={workspaceHref(item.slug)} className="flex items-center gap-2">
                <LedgerTile title={item.name} className="size-5" />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="text-xs text-muted-foreground">{ROLE_LABELS[item.role]}</span>
                {item.slug === slug && <CheckIcon className="size-4 text-primary" />}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/new">
            <PlusIcon /> Create a workspace
          </Link>
        </DropdownMenuItem>
        {workspace && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`${workspaceHref(workspace.slug)}/settings`}>
                <Settings2Icon /> Workspace settings
              </Link>
            </DropdownMenuItem>
            {canAdminister(workspace.role) && (
              <DropdownMenuItem asChild>
                <Link href={`${workspaceHref(workspace.slug)}/settings#invites`}>
                  <UserPlusIcon /> Invite people
                </Link>
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
