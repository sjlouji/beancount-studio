"use client";

import { HouseIcon, PlusIcon, SparklesIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "@/components/app/brand";
import { UserMenu } from "@/components/app/user-menu";
import { NewLedgerDialog } from "@/components/ledger/new-ledger-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { canWrite } from "@/components/workspace/rules";
import { useCurrentWorkspace } from "@/components/workspace/use-current-workspace";
import { workspaceHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

export interface RailSection {
  id: string;
  label: string;
  icon: LucideIcon;
  /** The section's first page; the sidebar then lists the rest. */
  href: string;
  active: boolean;
}

/** What a ledger page adds to the rail: its sections, and the Ask item that opens the assistant panel. */
export interface RailExtra {
  sections?: RailSection[];
  onAsk?: () => void;
  askActive?: boolean;
}

function RailButton({ label, icon: Icon, active, href, onClick }: { label: string; icon: LucideIcon; active?: boolean; href?: string; onClick?: () => void }) {
  const className = cn(
    "press flex w-full min-w-0 flex-col items-center gap-0.5 rounded-lg px-0.5 py-1.5 text-rail-foreground outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40",
    active ? "bg-rail-accent font-semibold" : "hover:bg-rail-accent/70",
  );
  const body = (
    <>
      <span className={cn("flex size-8 items-center justify-center rounded-lg", active && "bg-primary text-primary-foreground")}>
        <Icon className="size-[18px]" />
      </span>
      <span className="max-w-full truncate type-caption">{label}</span>
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
    <button type="button" onClick={onClick} aria-pressed={active} className={className}>
      {body}
    </button>
  );
}

/** The narrow leftmost column: the brand mark, the workspace's Home, a ledger's sections and Ask, new ledger and the account (settings live in its menu). */
export function Rail({ extra, className }: { extra?: RailExtra; className?: string }) {
  const pathname = usePathname();
  const { slug, workspace } = useCurrentWorkspace();
  const [creating, setCreating] = useState(false);
  const home = slug ? workspaceHref(slug) : "/";
  return (
    <nav aria-label="Primary" className={cn("w-18 shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-rail px-1 py-2", className)}>
      <Link href="/" aria-label="Beancount Studio home" className="mb-2 rounded-[9px] outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
        <BrandMark className="size-9 rounded-[9px] text-lg" />
      </Link>
      <RailButton label="Home" icon={HouseIcon} href={home} active={pathname === home} />
      {extra?.sections?.map((section) => (
        <RailButton key={section.id} label={section.label} icon={section.icon} href={section.href} active={section.active} />
      ))}
      {extra?.onAsk && <RailButton label="Ask" icon={SparklesIcon} onClick={extra.onAsk} active={extra.askActive} />}
      <div className="mt-auto flex flex-col items-center gap-2">
        {canWrite(workspace?.role) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={() => setCreating(true)} aria-label="New ledger" className="press flex size-9 items-center justify-center rounded-full bg-fill text-rail-foreground outline-none transition-colors hover:bg-rail-accent focus-visible:ring-3 focus-visible:ring-ring/40">
                <PlusIcon className="size-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">New ledger</TooltipContent>
          </Tooltip>
        )}
        <UserMenu compact />
      </div>
      <NewLedgerDialog open={creating} onOpenChange={setCreating} />
    </nav>
  );
}
