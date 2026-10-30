import type { ReactNode } from "react";
import { Brand } from "@/components/app/brand";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { UserMenu } from "@/components/app/user-menu";
import { cn } from "@/lib/utils";

/**
 * A page outside the frame for one focused task (onboarding, accepting an invite): the brand and
 * the account in a bar, the task in a centred column.
 */
export function FocusShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3 md:px-4">
        <Brand />
        <div className="flex items-center gap-0.5">
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>
      <main className="flex flex-1 justify-center px-4 py-10 md:py-14">
        <div className={cn("w-full max-w-lg animate-rise", className)}>{children}</div>
      </main>
    </div>
  );
}
