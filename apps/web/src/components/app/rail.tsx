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

/** What a ledger page adds to the rail: its sections, and Ask, the assistant's full page. */
export interface RailExtra {
  sections?: RailSection[];
  askHref?: string;
  askActive?: boolean;
}

// An icon-only item of the 56px rail: its label is the accessible name and a tooltip to the right.
function RailButton({ label, icon: Icon, active, href }: { label: string; icon: LucideIcon; active?: boolean; href: string }) {
  const className = cn(
    "press flex size-10 shrink-0 items-center justify-center rounded-lg text-rail-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
    active ? "bg-primary text-primary-foreground" : "hover:bg-rail-accent",
  );
  const icon = <Icon className="size-[18px]" />;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href={href} aria-label={label} aria-current={active ? "page" : undefined} className={className}>
          {icon}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/** The narrow (56px) leftmost column: the brand mark, the workspace's Home, a ledger's sections and Ask, new ledger and the account (settings live in its menu). */
export function Rail({ extra, className }: { extra?: RailExtra; className?: string }) {
  const pathname = usePathname();
  const { slug, workspace } = useCurrentWorkspace();
  const [creating, setCreating] = useState(false);
  const home = slug ? workspaceHref(slug) : "/";
  return (
    <nav aria-label="Primary" className={cn("w-14 shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-rail py-2", className)}>
      <Link href="/" aria-label="Beancount Studio home" className="mb-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
        <BrandMark className="size-8 rounded-lg text-base" />
      </Link>
      <RailButton label="Home" icon={HouseIcon} href={home} active={pathname === home} />
      {extra?.sections?.map((section) => (
        <RailButton key={section.id} label={section.label} icon={section.icon} href={section.href} active={section.active} />
      ))}
      {extra?.askHref && <RailButton label="Ask" icon={SparklesIcon} href={extra.askHref} active={extra.askActive} />}
      <div className="mt-auto flex flex-col items-center gap-2">
        {canWrite(workspace?.role) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={() => setCreating(true)} aria-label="New ledger" className="press flex size-8 items-center justify-center rounded-full bg-fill text-rail-foreground outline-none hover:bg-rail-accent focus-visible:ring-3 focus-visible:ring-ring/40">
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
