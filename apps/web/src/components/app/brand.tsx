import Link from "next/link";
import { cn } from "@/lib/utils";

export type BrandTone = "default" | "onAubergine";

/** The wordmark is aubergine on light canvases and white on the aubergine frame (DESIGN.md). */
export function BrandMark({ className, tone = "default" }: { className?: string; tone?: BrandTone }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-base font-bold leading-none",
        tone === "onAubergine" ? "bg-sidebar-foreground text-primary" : "bg-primary text-primary-foreground",
        className,
      )}
    >
      B
    </span>
  );
}

export function Brand({ href = "/ledgers", compact = false, tone = "default", className }: { href?: string; compact?: boolean; tone?: BrandTone; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-3",
        tone === "onAubergine" ? "focus-visible:ring-sidebar-ring/50" : "focus-visible:ring-ring/40",
        className,
      )}
    >
      <BrandMark tone={tone} />
      {!compact && <span className={cn("text-lg font-bold leading-none tracking-[-0.2px]", tone === "onAubergine" ? "text-sidebar-foreground" : "text-primary")}>Beancount Studio</span>}
    </Link>
  );
}
