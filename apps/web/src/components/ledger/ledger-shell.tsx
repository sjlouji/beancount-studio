"use client";

import { PlusIcon, SearchIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Brand } from "@/components/app/brand";
import { CommandPalette, useCommandPalette } from "@/components/app/command-palette";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { UserMenu } from "@/components/app/user-menu";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import type { Ledger } from "@/lib/api/types";
import { FilterBar } from "./filter-bar";
import { LedgerProvider, useLedgerContext } from "./ledger-context";
import { LedgerSidebar } from "./ledger-sidebar";
import { NewEntryDialog } from "./new-entry-dialog";

const NO_FILTER_PATHS = ["/files", "/commits", "/settings", "/ask", "/import", "/receipt", "/entry", "/query"];
const NO_INTERVAL_PATHS = ["/journal", "/accounts", "/commodities", "/documents", "/events", "/errors", "/budget", "/holdings", "/statistics"];

/** Height of the aubergine top bar; the fixed sidebar is offset below it through `--sidebar-top`. */
const TOP_BAR_HEIGHT = "3rem";

/** The Slack-style frame: a full-width aubergine bar with the search pill in the middle. */
function TopBar() {
  const { base, canWrite, ledger } = useLedgerContext();
  const palette = useCommandPalette();
  const [adding, setAdding] = useState(false);

  return (
    <div className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 bg-sidebar px-3 text-sidebar-foreground md:px-4">
      <Brand tone="onAubergine" compact className="md:hidden" />
      <Brand tone="onAubergine" className="hidden md:flex" />
      <button
        type="button"
        onClick={palette.open}
        className="mx-auto flex h-8 w-full max-w-xl items-center gap-2 rounded-full bg-sidebar-accent px-3 text-sm text-sidebar-foreground/85 transition-colors outline-none hover:bg-sidebar-accent/80 focus-visible:ring-3 focus-visible:ring-sidebar-ring/50"
        aria-label="Search and jump"
      >
        <SearchIcon className="size-4 shrink-0" />
        <span className="truncate">Search {ledger.title}</span>
        <span className="ml-auto hidden font-mono text-xs text-sidebar-muted sm:inline">⌘K</span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {canWrite && (
          <Button size="sm" variant="outline-on-aubergine" className="hidden sm:inline-flex" onClick={() => setAdding(true)}>
            <PlusIcon data-icon="inline-start" /> New entry
          </Button>
        )}
        <Button asChild size="sm" variant="ghost-on-aubergine">
          <Link href={`${base}/ask`}>
            <SparklesIcon data-icon="inline-start" /> Ask
          </Link>
        </Button>
        <ThemeToggle tone="onAubergine" />
        <UserMenu tone="onAubergine" />
      </div>
      <CommandPalette />
      {canWrite && <NewEntryDialog open={adding} onOpenChange={setAdding} />}
    </div>
  );
}

/** Slim toolbar at the top of the content pane: sidebar toggle plus the shared filters. */
function Toolbar() {
  const { base, ledger } = useLedgerContext();
  const pathname = usePathname();
  const rel = pathname.slice(base.length) || "/";
  const showFilters = !NO_FILTER_PATHS.some((p) => rel === p || rel.startsWith(`${p}/`));
  const showInterval = !NO_INTERVAL_PATHS.some((p) => rel === p || rel.startsWith(`${p}/`));

  return (
    <div className="sticky top-12 z-20 flex min-h-11 flex-wrap items-center gap-2 border-b bg-background/90 px-3 py-1.5 backdrop-blur md:rounded-t-lg md:px-4">
      <SidebarTrigger className="-ml-1" />
      {showFilters ? (
        <FilterBar showInterval={showInterval} />
      ) : (
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/ledgers" className="hover:text-foreground">
            Ledgers
          </Link>
          <span>/</span>
          <Link href={base} className="truncate font-semibold text-foreground">
            {ledger.title}
          </Link>
        </nav>
      )}
    </div>
  );
}

export function LedgerShell({ owner, slug, ledger, children }: { owner: string; slug: string; ledger: Ledger; children: ReactNode }) {
  return (
    <LedgerProvider owner={owner} slug={slug} ledger={ledger}>
      <div className="flex min-h-dvh flex-col bg-sidebar">
        <TopBar />
        <SidebarProvider className="min-h-0 flex-1" style={{ "--sidebar-top": TOP_BAR_HEIGHT } as CSSProperties}>
          <LedgerSidebar />
          <SidebarInset className="min-w-0">
            <Toolbar />
            <div className="flex-1 px-4 py-6 md:px-8 md:py-8">
              <div className="mx-auto w-full max-w-7xl">{children}</div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </LedgerProvider>
  );
}
