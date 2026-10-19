import type { ReactNode } from "react";
import { BalanceAmounts } from "@/components/app/amount";
import type { Balance } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export interface SummaryItem {
  label: string;
  /** Already in display sign. */
  balance: Balance;
  colored?: boolean;
  emphasis?: boolean;
  hint?: ReactNode;
}

/** A strip of labelled totals under a statement (net profit, balance sheet check, …). */
export function StatementSummary({
  title,
  items,
  footer,
  precisions,
  className,
}: {
  title: ReactNode;
  items: SummaryItem[];
  footer?: ReactNode;
  precisions: Record<string, number>;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border bg-card", className)}>
      <header className="border-b px-4 py-2.5">
        <h3 className="text-sm font-medium">{title}</h3>
      </header>
      <dl className="grid gap-x-6 gap-y-4 p-4 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
        {items.map((item) => (
          <div key={item.label} className={cn("min-w-0", item.emphasis && "sm:border-l sm:pl-6")}>
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className={cn("mt-1 text-base", item.emphasis && "font-semibold")}>
              <BalanceAmounts balance={item.balance} precisions={precisions} colored={item.colored} align="left" emptyLabel="0.00" />
            </dd>
            {item.hint && <div className="mt-0.5 text-xs text-muted-foreground">{item.hint}</div>}
          </div>
        ))}
      </dl>
      {footer && <footer className="border-t px-4 py-2 text-xs text-muted-foreground">{footer}</footer>}
    </section>
  );
}
