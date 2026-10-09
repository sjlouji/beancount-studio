import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-heading text-lg leading-none shadow-card",
        className,
      )}
    >
      B
      <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-chart-4 ring-2 ring-background" />
    </span>
  );
}

export function Brand({ href = "/ledgers", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <BrandMark />
      {!compact && (
        <span className="font-heading text-xl leading-none tracking-tight">
          Beancount <span className="italic text-primary">Studio</span>
        </span>
      )}
    </Link>
  );
}
