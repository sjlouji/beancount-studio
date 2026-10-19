"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "@/components/app/brand";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { UserMenu } from "@/components/app/user-menu";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/ledgers", label: "Ledgers" },
  { href: "/gallery", label: "Gallery" },
  { href: "/settings", label: "Settings" },
];

/** Home pages share the aubergine top bar; the canvas below stays white. */
export default function HomeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-6 px-4 md:px-6">
          <Brand tone="onAubergine" />
          <nav className="flex items-center gap-1 text-sm">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-full px-3 py-1.5 font-bold transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                    active ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-muted",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle tone="onAubergine" />
            <UserMenu tone="onAubergine" />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6 md:py-12">{children}</main>
    </div>
  );
}
