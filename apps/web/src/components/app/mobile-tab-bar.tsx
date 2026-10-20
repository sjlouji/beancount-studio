"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface MobileTab {
  label: string;
  icon: LucideIcon;
  href?: string;
  onClick?: () => void;
  active?: boolean;
}

/** Below `md` the rail and sidebar fold into a tab bar at the bottom, as on iPhone. */
export function MobileTabBar({ items }: { items: MobileTab[] }) {
  return (
    <nav aria-label="Tab bar" className="material-bar fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-border pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map((item) => {
        const className = cn("press flex flex-1 flex-col items-center justify-center gap-0.5 py-2 type-caption outline-none focus-visible:ring-3 focus-visible:ring-ring/40", item.active ? "text-primary" : "text-muted-foreground");
        const body = (
          <>
            <item.icon className="size-6" />
            <span>{item.label}</span>
          </>
        );
        return item.href ? (
          <Link key={item.label} href={item.href} aria-current={item.active ? "page" : undefined} className={className}>
            {body}
          </Link>
        ) : (
          <button key={item.label} type="button" onClick={item.onClick} aria-pressed={item.active} className={className}>
            {body}
          </button>
        );
      })}
    </nav>
  );
}
