"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface HeaderTab {
  label: string;
  href: string;
  active: boolean;
}

/**
 * The local nav at the top of the content column, as on apple.com's product pages: one 52px row
 * with the title on the left, the section's pages beside it and the actions on the right, then the
 * page's filters as a second quiet row. Static: sticky, the same glass and hairline on every page
 * and at every scroll position, and nothing in it animates when the page changes.
 */
export function ContentHeader({ title, status, actions, tabs, toolbar, className }: { title: ReactNode; status?: ReactNode; actions?: ReactNode; tabs?: HeaderTab[]; toolbar?: ReactNode; className?: string }) {
  return (
    <div className={cn("material-bar sticky top-0 z-20 border-b border-border", className)}>
      <div className="mx-auto flex h-13 w-full max-w-7xl items-center gap-4 px-4 md:gap-6 md:px-8">
        <div className="flex min-w-0 shrink items-center gap-2">
          <h2 className="truncate type-headline">{title}</h2>
          {status}
        </div>
        {tabs && tabs.length > 0 && (
          <nav aria-label="Section" className="-mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-thin md:justify-end">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={tab.active ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1.5 type-subhead whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40",
                  tab.active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        )}
        {actions && <div className={cn("flex shrink-0 items-center gap-1", !tabs?.length && "ml-auto")}>{actions}</div>}
      </div>
      {toolbar && <div className="mx-auto w-full max-w-7xl px-2 pb-1.5 md:px-6">{toolbar}</div>}
    </div>
  );
}
