"use client";

import { PlusIcon, SearchIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CommandPalette, useCommandPalette } from "@/components/app/command-palette";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { UserMenu } from "@/components/app/user-menu";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Ledger } from "@/lib/api/types";
import { FilterBar } from "./filter-bar";
import { LedgerProvider, useLedgerContext } from "./ledger-context";
import { LedgerSidebar } from "./ledger-sidebar";
import { NewEntryDialog } from "./new-entry-dialog";

const NO_FILTER_PATHS = ["/files", "/commits", "/settings", "/ask", "/import", "/receipt", "/entry", "/query"];
const NO_INTERVAL_PATHS = ["/journal", "/accounts", "/commodities", "/documents", "/events", "/errors", "/budget", "/holdings", "/statistics"];

function Header() {
  const { base, canWrite, ledger } = useLedgerContext();
  const pathname = usePathname();
  const palette = useCommandPalette();
  const [adding, setAdding] = useState(false);
  const rel = pathname.slice(base.length) || "/";
  const showFilters = !NO_FILTER_PATHS.some((p) => rel === p || rel.startsWith(`${p}/`));
  const showInterval = !NO_INTERVAL_PATHS.some((p) => rel === p || rel.startsWith(`${p}/`));

  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex h-12 items-center gap-2 px-3 md:px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm text-muted-foreground md:flex">
          <Link href="/ledgers" className="hover:text-foreground">
            Ledgers
          </Link>
          <span>/</span>
          <Link href={base} className="truncate font-medium text-foreground">
            {ledger.title}
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 font-normal text-muted-foreground" onClick={palette.open}>
                <SearchIcon className="size-3.5" />
                <span className="hidden sm:inline">Search &amp; jump</span>
                <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Command palette</TooltipContent>
          </Tooltip>
          {canWrite && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <PlusIcon data-icon="inline-start" /> New entry
            </Button>
          )}
          <Button asChild size="sm" variant="secondary">
            <Link href={`${base}/ask`}>
              <SparklesIcon data-icon="inline-start" /> Ask
            </Link>
          </Button>
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
      {showFilters && (
        <div className="border-t bg-surface/60 px-3 py-1.5 md:px-4">
          <FilterBar showInterval={showInterval} />
        </div>
      )}
      <CommandPalette />
      {canWrite && <NewEntryDialog open={adding} onOpenChange={setAdding} />}
    </header>
  );
}

export function LedgerShell({ owner, slug, ledger, children }: { owner: string; slug: string; ledger: Ledger; children: ReactNode }) {
  return (
    <LedgerProvider owner={owner} slug={slug} ledger={ledger}>
      <SidebarProvider>
        <LedgerSidebar />
        <SidebarInset className="min-w-0">
          <Header />
          <div className="flex-1 px-4 py-6 md:px-8 md:py-8">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </LedgerProvider>
  );
}
