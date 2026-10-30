import {
  ArrowLeftRightIcon,
  BarChart3Icon,
  BookOpenIcon,
  CalendarDaysIcon,
  ChartLineIcon,
  CoinsIcon,
  DatabaseIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderIcon,
  GitBranchIcon,
  HistoryIcon,
  InboxIcon,
  LayoutDashboardIcon,
  ListTreeIcon,
  PieChartIcon,
  ScanLineIcon,
  SettingsIcon,
  TableIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  UploadIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

export interface LedgerNavItem {
  label: string;
  /** Path under `/w/<workspace>/<slug>`; "" is the overview. */
  path: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Only shown to people who can write to the ledger. */
  write?: boolean;
}

export interface LedgerNavSection {
  id: string;
  label: string;
  /** Shown in the rail, where the section is picked. */
  icon: LucideIcon;
  items: LedgerNavItem[];
}

/**
 * One table for the rail (the sections), the sidebar (the current section's pages), the header
 * tabs (siblings of the current page) and the command palette.
 */
export const LEDGER_SECTIONS: LedgerNavSection[] = [
  {
    id: "ledger",
    label: "Overview",
    icon: LayoutDashboardIcon,
    items: [
      { label: "Overview", path: "", icon: LayoutDashboardIcon, exact: true },
      { label: "Journal", path: "/journal", icon: BookOpenIcon },
      { label: "Accounts", path: "/accounts", icon: ListTreeIcon },
      { label: "Budget", path: "/budget", icon: WalletIcon },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    icon: ChartLineIcon,
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
    id: "capture",
    label: "Capture",
    icon: InboxIcon,
    items: [
      { label: "Import statement", path: "/import", icon: UploadIcon, write: true },
      { label: "Scan receipt", path: "/receipt", icon: ScanLineIcon, write: true },
    ],
  },
  {
    id: "data",
    label: "Data",
    icon: TableIcon,
    items: [
      { label: "Query (BQL)", path: "/query", icon: DatabaseIcon },
      { label: "Commodities", path: "/commodities", icon: CoinsIcon },
      { label: "Documents", path: "/documents", icon: FileTextIcon },
      { label: "Events", path: "/events", icon: CalendarDaysIcon },
      { label: "Errors", path: "/errors", icon: TriangleAlertIcon },
    ],
  },
  {
    id: "repository",
    label: "Repository",
    icon: GitBranchIcon,
    items: [
      { label: "Files", path: "/files", icon: FolderIcon },
      { label: "History", path: "/commits", icon: HistoryIcon },
      { label: "Settings", path: "/settings", icon: SettingsIcon },
    ],
  },
];

/** The section's pages this person may open. */
export function visibleItems(section: LedgerNavSection, canWrite: boolean): LedgerNavItem[] {
  return section.items.filter((item) => !item.write || canWrite);
}

export function navItemIsActive(item: LedgerNavItem, base: string, pathname: string): boolean {
  const target = `${base}${item.path}`;
  if (item.exact) return pathname === target || pathname === `${target}/`;
  return pathname === target || pathname.startsWith(`${target}/`);
}

/** The section the current page belongs to, if any (account and entry detail pages have none). */
export function sectionForPath(base: string, pathname: string): LedgerNavSection | undefined {
  return LEDGER_SECTIONS.find((section) => section.items.some((item) => navItemIsActive(item, base, pathname)));
}
