import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The only place an h1 is rendered: an Apple large title with an optional small-caps eyebrow. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-3 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0 animate-rise">
        {eyebrow && <div className="mb-1.5 type-caption-2 text-muted-foreground">{eyebrow}</div>}
        <h1 className="type-large-title text-balance">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl type-body text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 animate-rise [animation-delay:60ms]">{actions}</div>}
    </div>
  );
}
