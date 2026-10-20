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
import { cn } from "@/lib/utils";

export const SIDEBAR_WIDTH = "17.5rem";

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
  aside,
  children,
  searchLabel,
  onSearch,
  railExtra,
  mobileTabs,
  contentClassName,
}: {
  sidebar: ReactNode;
  header?: ReactNode;
  aside?: ReactNode;
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
    <div className="flex h-dvh flex-col bg-background">
      <TopBar searchLabel={searchLabel} onSearch={onSearch} />
      <div className="flex min-h-0 flex-1">
        <Rail extra={railExtra} className="hidden md:flex" />
        <aside
          aria-label="Sidebar"
          className={cn("hidden shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out md:flex", sidebarOpen ? "w-(--sidebar-width)" : "w-0 border-r-0")}
          style={{ "--sidebar-width": SIDEBAR_WIDTH } as React.CSSProperties}
        >
          <div className="flex h-full w-(--sidebar-width) flex-col">{sidebar}</div>
        </aside>
        {/* Below md the tab bar is fixed over the viewport bottom; the column stops above it. */}
        <main className="flex min-w-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
          <div className="relative min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {header}
            <div className={cn("mx-auto w-full max-w-7xl px-4 py-5 md:px-8 md:py-7", contentClassName)}>{children}</div>
          </div>
        </main>
        {aside}
      </div>
      <MobileTabBar items={mobileTabs} />
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-sm gap-0 bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Sections and pages.</SheetDescription>
          </SheetHeader>
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
      <div className="flex h-11 shrink-0 items-center border-b border-border px-3">
        <Skeleton className="mx-auto h-8 w-full max-w-2xl rounded-lg" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-18 shrink-0 border-r border-sidebar-border bg-rail md:block" />
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
