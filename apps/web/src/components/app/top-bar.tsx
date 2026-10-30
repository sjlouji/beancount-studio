"use client";

import { ChevronLeftIcon, ChevronRightIcon, MenuIcon, PanelLeftIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/app/brand";
import { useFrameState } from "@/components/app/frame-state";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { UserMenu } from "@/components/app/user-menu";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** The full-width bar above the panes: history controls, the search field in the middle, the account. */
export function TopBar({ searchLabel, onSearch }: { searchLabel: string; onSearch: () => void }) {
  const router = useRouter();
  const { toggleSidebar, setMobileSidebarOpen } = useFrameState();
  return (
    <header className="material-bar z-30 flex h-11 shrink-0 items-center gap-2 border-b border-border px-2 md:px-3">
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open navigation" onClick={() => setMobileSidebarOpen(true)}>
          <MenuIcon />
        </Button>
        <Brand compact className="md:hidden" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="hidden md:inline-flex" aria-label="Toggle sidebar" onClick={toggleSidebar}>
              <PanelLeftIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle sidebar</TooltipContent>
        </Tooltip>
        <Button variant="ghost" size="icon-sm" className="hidden md:inline-flex" aria-label="Back" onClick={() => router.back()}>
          <ChevronLeftIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" className="hidden md:inline-flex" aria-label="Forward" onClick={() => router.forward()}>
          <ChevronRightIcon />
        </Button>
      </div>
      <button
        type="button"
        onClick={onSearch}
        className="press mx-auto flex h-8 w-full max-w-2xl items-center gap-2 rounded-lg bg-fill px-3 text-left type-subhead text-muted-foreground outline-none transition-colors hover:bg-fill-secondary focus-visible:ring-3 focus-visible:ring-ring/40"
        aria-label={searchLabel}
      >
        <SearchIcon className="size-4 shrink-0" />
        <span className="truncate">{searchLabel}</span>
        <Kbd className="ml-auto hidden sm:inline-flex">⌘K</Kbd>
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        <ThemeToggle />
        <span className="hidden md:inline-flex">
          <UserMenu />
        </span>
      </div>
    </header>
  );
}
