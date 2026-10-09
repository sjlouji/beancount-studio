"use client";

import {
  ArrowLeftRightIcon,
  BarChart3Icon,
  BookOpenIcon,
  CalendarDaysIcon,
  CoinsIcon,
  DatabaseIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  ListTreeIcon,
  PieChartIcon,
  ScanLineIcon,
  SettingsIcon,
  SparklesIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  UploadIcon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "@/components/app/brand";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useLedgerContext } from "./ledger-context";
import { LedgerSwitcher } from "./ledger-switcher";

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  exact?: boolean;
  badge?: React.ReactNode;
  hidden?: boolean;
}

export function LedgerSidebar() {
  const { base, queryString, meta, ledger } = useLedgerContext();
  const pathname = usePathname();
  const errors = meta?.errorsCount ?? 0;

  const groups: Array<{ label: string; items: NavItem[] }> = [
    {
      label: "Ledger",
      items: [
        { label: "Overview", path: "", icon: LayoutDashboardIcon, exact: true },
        { label: "Journal", path: "/journal", icon: BookOpenIcon },
        { label: "Accounts", path: "/accounts", icon: ListTreeIcon },
        { label: "Budget", path: "/budget", icon: WalletIcon },
      ],
    },
    {
      label: "Reports",
      items: [
        { label: "Income statement", path: "/income-statement", icon: TrendingUpIcon },
        { label: "Balance sheet", path: "/balance-sheet", icon: BarChart3Icon },
        { label: "Cash flow", path: "/cash-flow", icon: ArrowLeftRightIcon },
        { label: "Trial balance", path: "/trial-balance", icon: FileSpreadsheetIcon },
        { label: "Holdings", path: "/holdings", icon: PieChartIcon },
        { label: "Statistics", path: "/statistics", icon: DatabaseIcon },
      ],
    },
    {
      label: "Capture",
      items: [
        { label: "Import statement", path: "/import", icon: UploadIcon, hidden: !ledger.canWrite },
        { label: "Scan receipt", path: "/receipt", icon: ScanLineIcon, hidden: !ledger.canWrite },
        { label: "Ask the assistant", path: "/ask", icon: SparklesIcon },
      ],
    },
    {
      label: "Data",
      items: [
        { label: "Query (BQL)", path: "/query", icon: DatabaseIcon },
        { label: "Commodities", path: "/commodities", icon: CoinsIcon },
        { label: "Documents", path: "/documents", icon: FileTextIcon },
        { label: "Events", path: "/events", icon: CalendarDaysIcon },
        {
          label: "Errors",
          path: "/errors",
          icon: TriangleAlertIcon,
          badge: errors > 0 ? <SidebarMenuBadge className="bg-negative/15 text-negative">{errors}</SidebarMenuBadge> : undefined,
        },
      ],
    },
    {
      label: "Repository",
      items: [
        { label: "Files", path: "/files", icon: FolderIcon },
        { label: "History", path: "/commits", icon: HistoryIcon },
        { label: "Settings", path: "/settings", icon: SettingsIcon },
      ],
    },
  ];

  const isActive = (item: NavItem) => {
    const target = `${base}${item.path}`;
    if (item.exact) return pathname === target || pathname === `${target}/`;
    return pathname === target || pathname.startsWith(`${target}/`);
  };

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="gap-3">
        <div className="flex items-center justify-between px-1 group-data-[collapsible=icon]:justify-center">
          <Brand compact />
          {ledger.visibility === "public" && (
            <Badge variant="outline" className="group-data-[collapsible=icon]:hidden">
              Public
            </Badge>
          )}
        </div>
        <LedgerSwitcher />
      </SidebarHeader>
      <SidebarContent className="scrollbar-thin">
        {groups.map((group) => {
          const items = group.items.filter((item) => !item.hidden);
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.label}>
                        <Link href={`${base}${item.path}${queryString}`}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {item.badge}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        {meta && (
          <div className="rounded-lg border bg-surface/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            <div className="flex justify-between">
              <span>Transactions</span>
              <span className="tabular text-foreground">{meta.transactionsCount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Accounts</span>
              <span className="tabular text-foreground">{meta.accountsCount}</span>
            </div>
            {meta.lastTransactionDate && (
              <div className="flex justify-between">
                <span>Last entry</span>
                <span className="tabular text-foreground">{meta.lastTransactionDate}</span>
              </div>
            )}
          </div>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
