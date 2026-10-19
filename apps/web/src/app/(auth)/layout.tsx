import { Brand } from "@/components/app/brand";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { LedgerTicker } from "@/components/auth/ledger-ticker";

/**
 * DESIGN.md hero band: pastel-mesh gradient canvas, display headline with negative tracking, and a
 * floating product-UI mockup (the ledger ticker inside a miniature Studio window) that sits above
 * the gradient with no border or shadow. The form lives on the plain canvas beside it.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden pastel-mesh lg:flex lg:flex-col">
        <div className="relative z-10 p-8">
          <Brand href="/login" />
        </div>
        <div className="relative z-10 px-10 pt-4">
          <p className="type-micro-cap text-muted-foreground">Plain-text accounting, self-hosted</p>
          <h2 className="mt-4 max-w-lg text-[40px] leading-[1.15] font-bold tracking-[-0.464px] text-balance xl:type-display-xl">
            Your books as readable text, with the reports of a real finance tool.
          </h2>
          <p className="mt-5 max-w-md type-body-lg text-muted-foreground">
            Every change is a git commit. Every number traces back to a line in a file you own. Reports, imports, receipts and an assistant that asks before it writes.
          </p>
        </div>
        <div className="relative z-10 mt-12 ml-10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-tl-lg bg-card">
          <div className="flex h-9 shrink-0 items-center gap-2 bg-sidebar px-4" aria-hidden>
            <span className="size-2.5 rounded-full bg-sidebar-accent" />
            <span className="size-2.5 rounded-full bg-sidebar-accent" />
            <span className="size-2.5 rounded-full bg-sidebar-accent" />
            <span className="ml-4 h-5 w-64 rounded-full bg-sidebar-accent" />
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
