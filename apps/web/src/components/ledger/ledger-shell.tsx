"use client";

import { BookOpenIcon, DownloadIcon, HouseIcon, LayoutDashboardIcon, MenuIcon, MoreHorizontalIcon, PlusIcon, SearchIcon, SettingsIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AppFrame } from "@/components/app/app-frame";
import type { RailSection } from "@/components/app/rail";
import { CommandPalette, useCommandPalette } from "@/components/app/command-palette";
import { ContentHeader, type HeaderTab } from "@/components/app/content-header";
import { useFrameState } from "@/components/app/frame-state";
import { LedgerTile } from "@/components/app/sidebar-parts";
import { REMOTE_STATE_LABELS, RemoteStateBadge } from "@/components/data/settings-remote";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ledgerPath } from "@/lib/api/hooks";
import type { Ledger, LedgerRemote } from "@/lib/api/types";
import { formatRelative } from "@/lib/format";
import { workspaceHref } from "@/lib/routes";
import { AskPanel } from "./ask-panel";
import { FilterBar } from "./filter-bar";
import { LedgerProvider, useLedgerContext } from "./ledger-context";
import { LEDGER_SECTIONS, navItemIsActive, sectionForPath, visibleItems } from "./ledger-nav";
import { LedgerSidebar } from "./ledger-sidebar";
import { NewEntryDialog } from "./new-entry-dialog";

const NO_FILTER_PATHS = ["/files", "/commits", "/settings", "/ask", "/import", "/receipt", "/entry", "/query"];
const NO_INTERVAL_PATHS = ["/journal", "/accounts", "/commodities", "/documents", "/events", "/errors", "/budget", "/holdings", "/statistics"];

/** Push state of the ledger's remote; opens the Remote card in settings. */
function RemoteStatus({ remote, base }: { remote: LedgerRemote; base: string }) {
  const detail = remote.lastError || (remote.lastSyncedAt ? `Last synced ${formatRelative(remote.lastSyncedAt)}` : "Not synced yet");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href={`${base}/settings`} className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/40" aria-label={`Remote ${REMOTE_STATE_LABELS[remote.state].toLowerCase()}. ${detail}`}>
          <RemoteStateBadge state={remote.state} />
        </Link>
      </TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
  );
}

/** The channel-style header: ledger title, sync state, actions, the section's tabs and the filters. */
function Header() {
  const { base, ledger, canWrite, queryString } = useLedgerContext();
  const palette = useCommandPalette();
  const [adding, setAdding] = useState(false);
  const pathname = usePathname();
  const rel = pathname.slice(base.length) || "/";
  const showFilters = !NO_FILTER_PATHS.some((p) => rel === p || rel.startsWith(`${p}/`));
  const showInterval = !NO_INTERVAL_PATHS.some((p) => rel === p || rel.startsWith(`${p}/`));
  const section = sectionForPath(base, pathname);
  const tabs: HeaderTab[] = (section ? visibleItems(section, ledger.canWrite) : []).map((item) => ({ label: item.label, href: `${base}${item.path}${queryString}`, active: navItemIsActive(item, base, pathname) }));

  return (
    <>
      <ContentHeader
        leading={<LedgerTile title={ledger.title} className="size-7 rounded-[7px] text-[13px]" />}
        title={ledger.title}
        subtitle={ledger.description || `${ledger.workspace}/${ledger.slug}`}
        actions={
          <>
            {ledger.remote && <RemoteStatus remote={ledger.remote} base={base} />}
            {canWrite && (
              <Button size="sm" variant="secondary" className="max-sm:size-7 max-sm:rounded-md max-sm:px-0" aria-label="New entry" onClick={() => setAdding(true)}>
                <PlusIcon />
                <span className="max-sm:sr-only">New entry</span>
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Search this ledger" onClick={palette.open}>
                  <SearchIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Search (⌘K)</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href={`/api${ledgerPath(ledger.workspace, ledger.slug)}/archive`}>
                    <DownloadIcon /> Download archive
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`${base}/settings`}>
                    <SettingsIcon /> Ledger settings
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
        tabs={tabs}
        toolbar={showFilters ? <FilterBar showInterval={showInterval} /> : undefined}
      />
      {canWrite && <NewEntryDialog open={adding} onOpenChange={setAdding} />}
    </>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { ledger, base, queryString, ask, openAsk } = useLedgerContext();
  const palette = useCommandPalette();
  const { setMobileSidebarOpen } = useFrameState();
  const pathname = usePathname();
  const current = sectionForPath(base, pathname);
  // Detail pages (an account, an entry, the full assistant) belong to no section; the sidebar then lists the ledger's own pages.
  const sidebarSection = current ?? LEDGER_SECTIONS[0]!;
  const railSections: RailSection[] = LEDGER_SECTIONS.flatMap((section) => {
    const [first] = visibleItems(section, ledger.canWrite);
    return first ? [{ id: section.id, label: section.label, icon: section.icon, href: `${base}${first.path}${queryString}`, active: section.id === current?.id }] : [];
  });
  return (
    <AppFrame
      sidebar={<LedgerSidebar section={sidebarSection} onSearch={palette.open} />}
      header={<Header />}
      aside={<AskPanel />}
      searchLabel={`Search ${ledger.title}`}
      onSearch={palette.open}
      railExtra={{ sections: railSections, onAsk: () => openAsk(), askActive: ask.open }}
      mobileTabs={[
        { label: "Home", icon: HouseIcon, href: workspaceHref(ledger.workspace) },
        { label: "Overview", icon: LayoutDashboardIcon, href: base, active: pathname === base },
        { label: "Journal", icon: BookOpenIcon, href: `${base}/journal`, active: pathname.startsWith(`${base}/journal`) },
        { label: "Ask", icon: SparklesIcon, onClick: () => openAsk(), active: ask.open },
        { label: "Menu", icon: MenuIcon, onClick: () => setMobileSidebarOpen(true) },
      ]}
    >
      {children}
      <CommandPalette />
    </AppFrame>
  );
}

export function LedgerShell({ workspace, slug, ledger, children }: { workspace: string; slug: string; ledger: Ledger; children: ReactNode }) {
  return (
    <LedgerProvider workspace={workspace} slug={slug} ledger={ledger}>
      <Shell>{children}</Shell>
    </LedgerProvider>
  );
}
