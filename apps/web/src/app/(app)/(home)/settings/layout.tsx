"use client";

import { KeyRoundIcon, SlidersHorizontalIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { PageHeader } from "@/components/app/page-header";
import { cn } from "@/lib/utils";

const NAV: Array<{ href: string; label: string; icon: ComponentType<{ className?: string }>; danger?: boolean }> = [
  { href: "/settings", label: "General", icon: SlidersHorizontalIcon },
  { href: "/settings/api-keys", label: "API keys", icon: KeyRoundIcon },
  { href: "/settings/danger-zone", label: "Danger zone", icon: TriangleAlertIcon, danger: true },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Account" title="Settings" description="Your profile, appearance, credentials and programmatic access." />
      <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10">
        <nav aria-label="Settings" className="animate-rise [animation-delay:60ms]">
          <ul className="flex flex-col gap-1 md:sticky md:top-24">
            {NAV.map(({ href, label, icon: Icon, danger }) => {
              const active = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-muted",
                      active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                      danger && "text-negative hover:text-negative",
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
