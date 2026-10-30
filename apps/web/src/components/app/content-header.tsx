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
 * The channel-style header at the top of the content column: a title row with actions and a
 * tab row for the siblings of the current page. Sticky and translucent, so content scrolls
 * under it.
 */
export function ContentHeader({ title, subtitle, leading, actions, tabs, toolbar, className }: { title: ReactNode; subtitle?: ReactNode; leading?: ReactNode; actions?: ReactNode; tabs?: HeaderTab[]; toolbar?: ReactNode; className?: string }) {
  return (
    <div className={cn("material-bar sticky top-0 z-20 border-b border-border", className)}>
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 pt-2.5 md:px-8">
        {leading}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate type-headline">{title}</h2>
          </div>
          {subtitle && <div className="truncate type-footnote text-muted-foreground">{subtitle}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {tabs && tabs.length > 0 ? (
        <nav aria-label="Section" className="mx-auto flex w-full max-w-7xl gap-1 overflow-x-auto px-3 pt-1.5 scrollbar-thin md:px-7">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                "relative shrink-0 rounded-md px-2.5 py-2 type-subhead font-medium whitespace-nowrap outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40",
                tab.active ? "text-foreground after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary" : "text-muted-foreground",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      ) : (
        <div className="h-2.5" />
      )}
      {toolbar && <div className="mx-auto w-full max-w-7xl border-t border-border px-4 py-1.5 md:px-8">{toolbar}</div>}
    </div>
  );
}
