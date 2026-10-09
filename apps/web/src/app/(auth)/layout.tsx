import { Brand } from "@/components/app/brand";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { LedgerTicker } from "@/components/auth/ledger-ticker";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r bg-surface surface-grain lg:flex lg:flex-col">
        <div className="relative z-10 flex items-center justify-between p-8">
          <Brand href="/login" />
        </div>
        <div className="relative z-10 px-10 pt-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Plain-text accounting, self-hosted</p>
          <h2 className="mt-3 max-w-md font-heading text-5xl leading-[1.02] tracking-tight text-balance">
            Your books, as <span className="italic text-primary">readable text</span> — with the reports of a real finance tool.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
            Every change is a git commit. Every number traces back to a line in a file you own. Reports, imports, receipts and an assistant that asks before it writes.
          </p>
        </div>
        <LedgerTicker />
      </aside>
      <main className="relative flex flex-col">
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
