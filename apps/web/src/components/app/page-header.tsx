import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0 animate-rise">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</div>}
        <h1 className="font-heading text-3xl leading-none text-balance md:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 animate-rise [animation-delay:60ms]">{actions}</div>}
    </div>
  );
}
