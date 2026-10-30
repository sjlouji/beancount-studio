import Link from "next/link";
import { cn } from "@/lib/utils";

/** The mark: an accent squircle with the initial, the one place the brand colour appears. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-primary text-[15px] font-bold leading-none text-primary-foreground", className)}
    >
      B
    </span>
  );
}

export function Brand({ href = "/", compact = false, className }: { href?: string; compact?: boolean; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/40", className)}>
      <BrandMark />
      {!compact && <span className="type-headline text-foreground">Beancount Studio</span>}
    </Link>
  );
}
