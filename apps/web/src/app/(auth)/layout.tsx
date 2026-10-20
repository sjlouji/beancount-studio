import { Brand } from "@/components/app/brand";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { LedgerTicker } from "@/components/auth/ledger-ticker";

/**
 * Public surface: a quiet aurora on the grouped grey with the product statement and a window
 * showing ledger text, the form on the plain canvas beside it. The hero is pinned to the
 * viewport height so the ticker fills what is left rather than stretching the page.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden aurora lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="relative z-10 p-8">
          <Brand href="/login" />
        </div>
        <div className="relative z-10 px-10 pt-2">
          <p className="type-caption-2 text-muted-foreground">Plain-text accounting, self-hosted</p>
          <h2 className="mt-3 max-w-lg text-[clamp(2rem,3.2vw,3rem)] leading-[1.1] font-bold tracking-[-0.03em] text-balance">Your books as readable text, with the reports of a real finance tool.</h2>
          <p className="mt-4 max-w-md type-body text-muted-foreground">Every change is a git commit. Every number traces back to a line in a file you own. Reports, imports, receipts and an assistant that asks before it writes.</p>
        </div>
        <div className="relative z-10 mt-10 ml-10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-tl-2xl border-t border-l border-border bg-card shadow-lg">
          <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-muted px-4" aria-hidden>
            <span className="size-2.5 rounded-full bg-negative/70" />
            <span className="size-2.5 rounded-full bg-warning/70" />
            <span className="size-2.5 rounded-full bg-positive/70" />
            <span className="ml-3 h-5 w-56 rounded-md bg-fill" />
          </div>
          <LedgerTicker />
        </div>
      </aside>
      <main className="relative flex flex-col bg-background">
        <div className="flex items-center justify-between p-4 lg:justify-end">
          <div className="lg:hidden">
            <Brand href="/login" />
          </div>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-sm animate-rise">{children}</div>
        </div>
      </main>
    </div>
  );
}
