"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useFrameState } from "@/components/app/frame-state";
import { MobileTabBar, type MobileTab } from "@/components/app/mobile-tab-bar";
import { Rail, type RailExtra } from "@/components/app/rail";
import { TopBar } from "@/components/app/top-bar";
import { PageSkeleton } from "@/components/app/states";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SkipLink } from "@/components/ui/skip-link";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { cn } from "@/lib/utils";

// 240px: the width of a Mac app sidebar (Finder, Mail). Long names truncate; the content gets the room.
export const SIDEBAR_WIDTH = "15rem";

/**
 * The Slack frame: a full-width top bar, then the rail, the sidebar, the content column and an
 * optional right panel. Below `md` the rail and sidebar give way to a tab bar and a sheet that
 * holds them both. The
 * content column scrolls on its own; `header` is sticky inside it so content slides under it
 * as under Apple's translucent bars.
 */
export function AppFrame({
  sidebar,
  header,
  children,
  searchLabel,
  onSearch,
  railExtra,
  mobileTabs,
  contentClassName,
}: {
  sidebar: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  searchLabel: string;
  onSearch: () => void;
  railExtra?: RailExtra;
  mobileTabs: MobileTab[];
  contentClassName?: string;
}) {
  const { sidebarOpen, mobileSidebarOpen, setMobileSidebarOpen } = useFrameState();
  const pathname = usePathname();
  // Picking a page or a section in the sheet navigates; the sheet gives way to the page.
  useEffect(() => setMobileSidebarOpen(false), [pathname, setMobileSidebarOpen]);
  return (
    <div className="flex h-dvh flex-col bg-background pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <SkipLink />
      <TopBar searchLabel={searchLabel} onSearch={onSearch} />
      <div className="flex min-h-0 flex-1">
        <Rail extra={railExtra} className="hidden md:flex" />
        <aside
          aria-label="Sidebar"
          className={cn("hidden shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex", sidebarOpen ? "w-(--sidebar-width)" : "w-0 border-r-0")}
          style={{ "--sidebar-width": SIDEBAR_WIDTH } as React.CSSProperties}
        >
          <div className="flex h-full w-(--sidebar-width) flex-col">{sidebar}</div>
        </aside>
        {/* Below md the tab bar is fixed over the viewport bottom; the column stops above it. */}
        <main className="flex min-w-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
          {/* The skip link lands on the scrolling column itself, so Space and the arrow keys scroll it. */}
          <div id="main-content" tabIndex={-1} className="relative min-h-0 flex-1 overflow-y-auto outline-none scrollbar-thin">
            {header}
            <div className={cn("mx-auto w-full max-w-7xl px-4 py-5 md:px-8 md:py-7", contentClassName)}>{children}</div>
          </div>
        </main>
      </div>
      <MobileTabBar items={mobileTabs} />
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-sm gap-0 bg-sidebar p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-sidebar-foreground [&>button]:hidden">
          <VisuallyHidden asChild>
            <SheetHeader>
              <SheetTitle>Navigation</SheetTitle>
              <SheetDescription>Sections and pages.</SheetDescription>
            </SheetHeader>
          </VisuallyHidden>
          <div className="flex h-full">
            <Rail extra={railExtra} className="flex" />
            <div className="flex h-full min-w-0 flex-1 flex-col">{sidebar}</div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** The frame's silhouette while the ledger itself is still loading, so the page never flashes empty. */
export function FrameSkeleton() {
  return (
    <div role="status" aria-label="Opening ledger" className="flex h-dvh flex-col bg-background">
      <div className="flex h-[calc(2.75rem+env(safe-area-inset-top))] shrink-0 items-center border-b border-border px-3 pt-[env(safe-area-inset-top)]">
        <Skeleton className="mx-auto h-8 w-full max-w-2xl rounded-lg" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-14 shrink-0 border-r border-sidebar-border bg-rail md:block" />
        <div className="hidden w-(--sidebar-width) shrink-0 flex-col gap-3 border-r border-sidebar-border bg-sidebar p-3 md:flex" style={{ "--sidebar-width": SIDEBAR_WIDTH } as React.CSSProperties}>
          <Skeleton className="h-9 rounded-lg" />
          <Skeleton className="h-8 rounded-lg" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-5" style={{ width: `${45 + ((i * 19) % 40)}%` }} />
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="border-b border-border px-4 py-3 md:px-8">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
          <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">
            <PageSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}
