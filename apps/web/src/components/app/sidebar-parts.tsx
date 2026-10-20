"use client";

import { ChevronRightIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** The "Find anything…" field under the switcher; it opens the command palette. */
export function SidebarFind({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="press mx-3 mb-2 flex h-8 items-center gap-2 rounded-lg bg-fill px-2.5 text-left type-subhead text-sidebar-muted outline-none transition-colors hover:bg-fill-secondary focus-visible:ring-3 focus-visible:ring-sidebar-ring/40"
    >
      <SearchIcon className="size-4 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
    </button>
  );
}

/** One row: icon or tile, label, optional trailing badge. Selected rows take the accent fill. */
export function SidebarItem({ href, active, icon, label, trailing, onClick }: { href?: string; active?: boolean; icon?: ReactNode; label: string; trailing?: ReactNode; onClick?: () => void }) {
  const className = cn(
    "press group/item flex h-7 w-full items-center gap-2 rounded-md px-2 text-left type-body outline-none transition-colors focus-visible:ring-3 focus-visible:ring-sidebar-ring/40",
    active ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground" : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground",
  );
  const body = (
    <>
      {icon && <span className={cn("flex size-4 shrink-0 items-center justify-center [&>svg]:size-4", active ? "text-sidebar-primary-foreground" : "text-sidebar-muted group-hover/item:text-sidebar-foreground")}>{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </>
  );
  if (href) {
    return (
      <Link href={href} aria-current={active ? "page" : undefined} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

// Open state of the sections, remembered per browser; falls back to memory when storage is blocked.
const sectionListeners = new Set<() => void>();
const sectionMemory = new Map<string, boolean>();

function readSectionOpen(key: string, fallback: boolean): boolean {
  const remembered = sectionMemory.get(key);
  if (remembered !== undefined) return remembered;
  try {
    const saved = window.localStorage.getItem(key);
    return saved === null ? fallback : saved === "1";
  } catch {
    return fallback;
  }
}

function usePersistedOpen(key: string, fallback: boolean): [boolean, () => void] {
  const open = useSyncExternalStore(
    (onChange) => {
      sectionListeners.add(onChange);
      window.addEventListener("storage", onChange);
      return () => {
        sectionListeners.delete(onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    () => readSectionOpen(key, fallback),
    () => fallback,
  );
  const toggle = useCallback(() => {
    const next = !open;
    sectionMemory.set(key, next);
    try {
      window.localStorage.setItem(key, next ? "1" : "0");
    } catch {
      /* storage can be unavailable; memory keeps the state for this visit */
    }
    sectionListeners.forEach((listener) => listener());
  }, [key, open]);
  return [open, toggle];
}

/** A Slack-style collapsible section with a caret; its open state survives reloads per section id. */
export function SidebarSection({ id, label, action, children, defaultOpen = true }: { id: string; label: string; action?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, toggle] = usePersistedOpen(`sidebar:${id}`, defaultOpen);
  const reduceMotion = useReducedMotion();
  return (
    <div className="px-3 pt-3">
      <div className="flex items-center gap-1">
        <button type="button" onClick={toggle} aria-expanded={open} className="press flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md px-1 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/40">
          <ChevronRightIcon className={cn("size-3.5 shrink-0 text-sidebar-muted transition-transform duration-200", open && "rotate-90")} />
          <span className="truncate type-subhead font-semibold text-sidebar-muted">{label}</span>
        </button>
        {action}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-px pt-1 pl-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Square tile with an initial, used for ledgers in lists and in the switcher. */
export function LedgerTile({ title, className }: { title: string; className?: string }) {
  return <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-secondary text-[10px] font-bold text-secondary-foreground", className)}>{title.slice(0, 1).toUpperCase()}</span>;
}

export function SidebarListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-1.5 px-2 pt-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-1 py-1">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-3" style={{ width: `${50 + ((i * 23) % 40)}%` }} />
        </div>
      ))}
    </div>
  );
}
