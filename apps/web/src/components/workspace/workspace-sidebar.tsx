"use client";

import { HouseIcon, KeyRoundIcon, PlusIcon, Settings2Icon, SettingsIcon, StarIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LedgerTile, SidebarFind, SidebarItem, SidebarListSkeleton, SidebarSection } from "@/components/app/sidebar-parts";
import { NewLedgerDialog } from "@/components/ledger/new-ledger-dialog";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api/client";
import { useLedgers, useMe, useWorkspaceLedgers } from "@/lib/api/hooks";
import { ledgerHref, workspaceHref } from "@/lib/routes";
import { canWrite } from "./rules";
import { useCurrentWorkspace } from "./use-current-workspace";
import { WorkspaceSwitcher } from "./workspace-switcher";

/** The sidebar outside a ledger: the workspace switcher, its places, its ledgers like channels, then the account. */
export function WorkspaceSidebar({ onSearch }: { onSearch: () => void }) {
  const pathname = usePathname();
  const { data: me } = useMe();
  const { slug, workspace, workspaces } = useCurrentWorkspace();
  const ledgers = useWorkspaceLedgers(slug, Boolean(me));
  const everything = useLedgers(Boolean(me));
  const [creating, setCreating] = useState(false);
  const starred = (everything.data ?? []).filter((item) => item.isStarred);
  const writer = canWrite(workspace?.role);
  const home = slug ? workspaceHref(slug) : "/";
  const is = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between gap-1 px-2">
        <WorkspaceSwitcher />
        {writer && (
          <Button variant="ghost" size="icon-sm" aria-label="New ledger" onClick={() => setCreating(true)}>
            <PlusIcon />
          </Button>
        )}
      </div>
      <SidebarFind label="Find a ledger or page…" onOpen={onSearch} />
      <div className="relative min-h-0 flex-1 overflow-y-auto pb-4 scrollbar-thin">
        <div className="flex flex-col gap-px px-3">
          <SidebarItem href={home} active={pathname === home} icon={<HouseIcon />} label="Home" />
          {workspace && <SidebarItem href={`${home}/settings`} active={is(`${home}/settings`)} icon={<Settings2Icon />} label="Workspace settings" />}
        </div>
        {me && workspaces.isSuccess && workspaces.data.length === 0 && (
          <div className="px-3 pt-4">
            <p className="type-footnote text-sidebar-muted">You are not in a workspace yet.</p>
            <Button asChild size="sm" className="mt-2 w-full">
              <Link href="/new">
                <PlusIcon data-icon="inline-start" /> Create a workspace
              </Link>
            </Button>
          </div>
        )}
        {starred.length > 0 && (
          <SidebarSection id="home-starred" label="Starred">
            {starred.map((item) => (
              <SidebarItem key={item.id} href={ledgerHref(item.workspace, item.slug)} icon={<StarIcon />} label={item.title} />
            ))}
          </SidebarSection>
        )}
        {slug && (
          <SidebarSection
            id="home-ledgers"
            label="Ledgers"
            action={
              writer ? (
                <Button variant="ghost" size="icon-xs" aria-label="New ledger" onClick={() => setCreating(true)}>
                  <PlusIcon />
                </Button>
              ) : undefined
            }
          >
            {ledgers.isPending ? (
              <SidebarListSkeleton />
            ) : ledgers.isError ? (
              <p className="px-2 py-1 type-footnote text-negative">{errorMessage(ledgers.error)}</p>
            ) : (
              <>
                {ledgers.data.map((item) => (
                  <SidebarItem
                    key={item.id}
                    href={ledgerHref(item.workspace, item.slug)}
                    active={is(ledgerHref(item.workspace, item.slug))}
                    icon={<LedgerTile title={item.title} className="size-4 rounded-[4px] text-[9px]" />}
                    label={item.title}
                  />
                ))}
                {ledgers.data.length === 0 && <p className="px-2 py-1 type-footnote text-sidebar-muted">No ledgers yet.</p>}
                {writer && <SidebarItem onClick={() => setCreating(true)} icon={<PlusIcon />} label="Add a ledger" />}
              </>
            )}
          </SidebarSection>
        )}
        {me && (
          <SidebarSection id="home-account" label="Account" defaultOpen={false}>
            <SidebarItem href="/settings" active={pathname.startsWith("/settings") && !is("/settings/api-keys")} icon={<SettingsIcon />} label="Account settings" />
            <SidebarItem href="/settings/api-keys" active={is("/settings/api-keys")} icon={<KeyRoundIcon />} label="API keys" />
          </SidebarSection>
        )}
      </div>
      <NewLedgerDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
