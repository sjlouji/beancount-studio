import type { ReactNode } from "react";
import { Brand } from "@/components/app/brand";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { UserMenu } from "@/components/app/user-menu";
import { SkipLink } from "@/components/ui/skip-link";
import { cn } from "@/lib/utils";

/**
 * A page outside the frame for one focused task (onboarding, accepting an invite): the brand and
 * the account in a bar, the task in a centred column.
 */
export function FocusShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SkipLink />
      <header className="titlebar flex h-11 shrink-0 items-center justify-between border-b border-border pr-3 md:pr-4">
        <Brand />
        <div className="flex items-center gap-0.5">
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="flex flex-1 justify-center px-4 py-10 outline-none md:py-14">
        <div className={cn("w-full max-w-lg animate-rise", className)}>{children}</div>
      </main>
    </div>
  );
}
