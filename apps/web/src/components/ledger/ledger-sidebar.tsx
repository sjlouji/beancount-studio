"use client";

import { usePathname } from "next/navigation";
import { SidebarFind, SidebarItem } from "@/components/app/sidebar-parts";
import { Badge } from "@/components/ui/badge";
import { useLedgerContext } from "./ledger-context";
import { navItemIsActive, visibleItems, type LedgerNavSection } from "./ledger-nav";
import { LedgerSwitcher } from "./ledger-switcher";

/**
 * The sidebar inside a ledger: the switcher, a find field, the pages of the section picked in the
 * rail (Overview, Reports, Capture, Data or Repository), then the ledger's vital numbers.
 */
export function LedgerSidebar({ section, onSearch }: { section: LedgerNavSection; onSearch: () => void }) {
  const { base, queryString, meta, ledger } = useLedgerContext();
  const pathname = usePathname();
  const errors = meta?.errorsCount ?? 0;

  return (
    <>
      <div className="flex h-12 shrink-0 items-center px-2">
        <LedgerSwitcher />
      </div>
      <SidebarFind label={`Find in ${ledger.title}…`} onOpen={onSearch} />
      <nav aria-label={section.label} className="relative min-h-0 flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
        <div className="flex flex-col gap-px">
          {visibleItems(section, ledger.canWrite).map((item) => (
            <SidebarItem
              key={item.path}
              href={`${base}${item.path}${queryString}`}
              active={navItemIsActive(item, base, pathname)}
              icon={<item.icon />}
              label={item.label}
              trailing={
                item.path === "/errors" && errors > 0 ? (
                  <Badge variant="destructive" className="h-[18px] px-1.5 text-[10px]">
                    {errors}
                  </Badge>
                ) : undefined
              }
            />
          ))}
        </div>
      </nav>
      {meta && (
        <div className="shrink-0 border-t border-sidebar-border px-4 py-2.5 type-caption text-sidebar-muted">
          <span className="tabular">{meta.transactionsCount.toLocaleString()}</span> transactions · <span className="tabular">{meta.accountsCount}</span> accounts
          {meta.lastTransactionDate && (
            <>
              {" "}
              · last <span className="tabular">{meta.lastTransactionDate}</span>
            </>
          )}
        </div>
      )}
    </>
  );
}
