import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface BarListItem {
  key: string;
  label: ReactNode;
  value: number;
  href?: string;
  mono?: boolean;
}

/** Horizontal bars as plain divs: label, proportional bar, tabular count. */
export function BarList({ items, className }: { items: BarListItem[]; className?: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className={cn("space-y-1.5", className)}>
      {items.map((item) => {
        const label = <span className={cn("truncate", item.mono && "font-mono text-[13px]")}>{item.label}</span>;
        return (
          <li key={item.key} className="grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_3.5rem]">
            {item.href ? (
              <Link href={item.href} className="flex min-w-0 hover:underline" title={typeof item.label === "string" ? item.label : undefined}>
                {label}
              </Link>
            ) : (
              <span className={cn("flex min-w-0", item.value === 0 && "text-muted-foreground")}>{label}</span>
            )}
            <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className="block h-full rounded-full bg-chart-1" style={{ width: `${(item.value / max) * 100}%` }} />
            </span>
            <span className="tabular text-right text-muted-foreground">{item.value.toLocaleString()}</span>
          </li>
        );
      })}
    </ul>
  );
}
