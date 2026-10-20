"use client";

import { ChevronDownIcon, HouseIcon, KeyRoundIcon, PlusIcon, SettingsIcon, StarIcon, UsersIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LedgerTile, SidebarFind, SidebarItem, SidebarListSkeleton, SidebarSection } from "@/components/app/sidebar-parts";
import { NewLedgerDialog } from "@/components/ledger/new-ledger-dialog";
import { Button } from "@/components/ui/button";
import { useLedgers, useMe } from "@/lib/api/hooks";

/** The sidebar outside a ledger: the app's places, then your ledgers like channels. */
export function HomeSidebar({ onSearch }: { onSearch: () => void }) {
  const pathname = usePathname();
  const { data: me, isPending: mePending } = useMe();
  const ledgers = useLedgers(Boolean(me));
  const [creating, setCreating] = useState(false);
  const starred = (ledgers.data ?? []).filter((l) => l.isStarred);
  const mine = (ledgers.data ?? []).filter((l) => l.role === "owner");
  const shared = (ledgers.data ?? []).filter((l) => l.role !== "owner");
  const is = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate type-headline">Beancount Studio</span>
          <ChevronDownIcon className="size-4 shrink-0 text-sidebar-muted" aria-hidden />
        </div>
        {me && (
          <Button variant="ghost" size="icon-sm" aria-label="New ledger" onClick={() => setCreating(true)}>
            <PlusIcon />
          </Button>
        )}
      </div>
      <SidebarFind label="Find a ledger or page…" onOpen={onSearch} />
      <div className="relative min-h-0 flex-1 overflow-y-auto pb-4 scrollbar-thin">
        <div className="flex flex-col gap-px px-3">
          <SidebarItem href="/ledgers" active={pathname === "/ledgers"} icon={<HouseIcon />} label="Home" />
          <SidebarItem href="/settings" active={pathname === "/settings"} icon={<SettingsIcon />} label="Settings" />
          <SidebarItem href="/settings/api-keys" active={is("/settings/api-keys")} icon={<KeyRoundIcon />} label="API keys" />
        </div>
        {(mePending || ledgers.isPending) && me !== null ? (
          <SidebarSection id="home-ledgers" label="Ledgers">
            <SidebarListSkeleton />
          </SidebarSection>
        ) : null}
        {ledgers.isError && (
          <SidebarSection id="home-ledgers" label="Ledgers">
            <p className="px-2 py-1 type-footnote text-negative">{ledgers.error.message}</p>
          </SidebarSection>
        )}
        {ledgers.data && (
          <>
            {starred.length > 0 && (
              <SidebarSection id="home-starred" label="Starred">
                {starred.map((l) => (
                  <SidebarItem key={l.id} href={`/ledger/${l.owner}/${l.slug}`} icon={<StarIcon />} label={l.title} />
                ))}
              </SidebarSection>
            )}
            <SidebarSection
              id="home-ledgers"
              label="Ledgers"
              action={
                <Button variant="ghost" size="icon-xs" aria-label="New ledger" onClick={() => setCreating(true)}>
                  <PlusIcon />
                </Button>
              }
            >
              {mine.map((l) => (
                <SidebarItem key={l.id} href={`/ledger/${l.owner}/${l.slug}`} icon={<LedgerTile title={l.title} className="size-4 rounded-[4px] text-[9px]" />} label={l.title} />
              ))}
              {mine.length === 0 && <p className="px-2 py-1 type-footnote text-sidebar-muted">No ledgers yet.</p>}
              <SidebarItem onClick={() => setCreating(true)} icon={<PlusIcon />} label="Add a ledger" />
            </SidebarSection>
            {shared.length > 0 && (
              <SidebarSection id="home-shared" label="Shared with me">
                {shared.map((l) => (
                  <SidebarItem key={l.id} href={`/ledger/${l.owner}/${l.slug}`} icon={<UsersIcon />} label={l.title} />
                ))}
              </SidebarSection>
            )}
          </>
        )}
      </div>
      <NewLedgerDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
