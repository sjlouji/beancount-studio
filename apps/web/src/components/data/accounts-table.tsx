"use client";

import { ChevronRightIcon, FileCodeIcon, MoreHorizontalIcon, PlusIcon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BalanceAmounts } from "@/components/app/amount";
import { accountHref, useLedgerContext } from "@/components/ledger/ledger-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AccountDetail, Balance } from "@/lib/api/types";
import { accountLeaf } from "@/lib/format";
import { cn } from "@/lib/utils";

export type AccountsViewMode = "tree" | "table";

interface TreeItem {
  name: string;
  /** Null for intermediate path segments that were never opened (e.g. "Assets" itself). */
  detail: AccountDetail | null;
  children: Map<string, TreeItem>;
}

interface Row {
  name: string;
  level: number;
  detail: AccountDetail | null;
  hasChildren: boolean;
  aggregate: Balance;
}

const STATUS: Record<NonNullable<AccountDetail["uptodateStatus"]>, { dot: string; label: string }> = {
  green: { dot: "bg-positive", label: "Last entry is a passing balance assertion" },
  yellow: { dot: "bg-warning", label: "Entries exist after the last balance assertion" },
  red: { dot: "bg-negative", label: "The last balance assertion failed" },
};

function addInto(target: Balance, source: Balance) {
  for (const [unit, value] of Object.entries(source)) target[unit] = (target[unit] ?? 0) + value;
}

function buildTree(accounts: AccountDetail[]): TreeItem {
  const root: TreeItem = { name: "", detail: null, children: new Map() };
  for (const detail of accounts) {
    let node = root;
    const parts = detail.account.split(":");
    parts.forEach((part, index) => {
      const name = parts.slice(0, index + 1).join(":");
      let child = node.children.get(part);
      if (!child) {
        child = { name, detail: null, children: new Map() };
        node.children.set(part, child);
      }
      node = child;
    });
    node.detail = detail;
  }
  return root;
}

/** Balance shown for a row: opened accounts report their own subtotal, path-only nodes sum their children. */
function aggregateOf(node: TreeItem): Balance {
  if (node.detail) return node.detail.balanceChildren;
  const total: Balance = {};
  for (const child of node.children.values()) addInto(total, aggregateOf(child));
  return total;
}

function flatten(root: TreeItem, collapsed: Set<string>, forceOpen: boolean): Row[] {
  const rows: Row[] = [];
  const walk = (node: TreeItem, level: number) => {
    const children = Array.from(node.children.values()).sort((a, b) => a.name.localeCompare(b.name));
    rows.push({ name: node.name, level, detail: node.detail, hasChildren: children.length > 0, aggregate: aggregateOf(node) });
    if (forceOpen || !collapsed.has(node.name)) for (const child of children) walk(child, level + 1);
  };
  for (const child of Array.from(root.children.values()).sort((a, b) => a.name.localeCompare(b.name))) walk(child, 0);
  return rows;
}

/** Account names that have children, used for "collapse all" and the initial collapsed set. */
function parentNames(accounts: AccountDetail[]): Map<string, number> {
  const depths = new Map<string, number>();
  for (const { account } of accounts) {
    const parts = account.split(":");
    for (let i = 1; i < parts.length; i += 1) depths.set(parts.slice(0, i).join(":"), i - 1);
  }
  return depths;
}

function StatusDot({ status }: { status: AccountDetail["uptodateStatus"] }) {
  if (!status) return <span className="text-muted-foreground">–</span>;
  const { dot, label } = STATUS[status];
  return <span role="img" aria-label={label} title={label} className={cn("inline-block size-2.5 rounded-full", dot)} />;
}

export function AccountsTable({
  accounts,
  mode,
  forceOpen,
  onNewEntry,
  onCloseAccount,
  onViewSource,
}: {
  accounts: AccountDetail[];
  mode: AccountsViewMode;
  /** Ignore collapsed state (used while searching so matches are never hidden). */
  forceOpen: boolean;
  onNewEntry: (account: string) => void;
  onCloseAccount: (account: string) => void;
  onViewSource: (entryHash: string) => void;
}) {
  const { base, queryString, precisions, canWrite } = useLedgerContext();
  const parents = useMemo(() => parentNames(accounts), [accounts]);
  // Start with everything below the second level folded so large ledgers stay scannable.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(Array.from(parents).filter(([, depth]) => depth >= 1).map(([name]) => name)));

  const rows = useMemo<Row[]>(() => {
    if (mode === "table") {
      return accounts.map((detail) => ({ name: detail.account, level: 0, detail, hasChildren: false, aggregate: detail.balanceChildren }));
    }
    return flatten(buildTree(accounts), collapsed, forceOpen);
  }, [accounts, mode, collapsed, forceOpen]);

  const toggle = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      {mode === "tree" && (
        <header className="flex items-center justify-end gap-1 border-b px-3 py-1.5">
          <Button variant="ghost" size="xs" onClick={() => setCollapsed(new Set())}>
            Expand all
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setCollapsed(new Set(parents.keys()))}>
            Collapse all
          </Button>
        </header>
      )}
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Account</TableHead>
            <TableHead>Opened</TableHead>
            <TableHead>Closed</TableHead>
            <TableHead>Currencies</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="text-right">Entries</TableHead>
            <TableHead>Last entry</TableHead>
            <TableHead className="w-12">Status</TableHead>
            {canWrite && (
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const { detail } = row;
            const isOpen = forceOpen || !collapsed.has(row.name);
            return (
              <TableRow key={row.name} className={cn(detail?.closedAt && "text-muted-foreground")}>
                <TableCell style={{ paddingLeft: `${0.5 + row.level * 1.1}rem` }}>
                  <span className="flex items-center gap-1">
                    {mode === "tree" &&
                      (row.hasChildren ? (
                        <button
                          type="button"
                          onClick={() => toggle(row.name)}
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? "Collapse" : "Expand"} ${row.name}`}
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <ChevronRightIcon className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} />
                        </button>
                      ) : (
                        <span className="inline-block size-4.5" />
                      ))}
                    {detail ? (
                      <Link href={accountHref(base, row.name, queryString)} className="truncate font-mono text-[13px] hover:underline">
                        {mode === "tree" ? accountLeaf(row.name) : row.name}
                      </Link>
                    ) : (
                      <span className="truncate font-mono text-[13px] text-muted-foreground">{accountLeaf(row.name)}</span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{detail?.openedAt}</TableCell>
                <TableCell className="font-mono text-xs">{detail?.closedAt ?? ""}</TableCell>
                <TableCell>
                  {detail && detail.currencies.length > 0 && (
                    <span className="flex flex-wrap gap-1">
                      {detail.currencies.map((currency) => (
                        <Badge key={currency} variant="outline" className="font-mono text-[11px]">
                          {currency}
                        </Badge>
                      ))}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <BalanceAmounts balance={row.aggregate} precisions={precisions} emptyLabel="" />
                </TableCell>
                <TableCell className="tabular text-right">{detail?.entryCount.toLocaleString()}</TableCell>
                <TableCell>
                  {detail?.lastEntry && (
                    <Link href={`${base}/entry/${detail.lastEntry.entryHash}`} className="font-mono text-xs hover:underline">
                      {detail.lastEntry.date}
                    </Link>
                  )}
                </TableCell>
                <TableCell>{detail && <StatusDot status={detail.uptodateStatus} />}</TableCell>
                {canWrite && (
                  <TableCell>
                    {detail && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${row.name}`}>
                            <MoreHorizontalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => onNewEntry(row.name)}>
                            <PlusIcon /> New entry
                          </DropdownMenuItem>
                          {!detail.closedAt && (
                            <DropdownMenuItem onSelect={() => onCloseAccount(row.name)}>
                              <XCircleIcon /> Close account
                            </DropdownMenuItem>
                          )}
                          {detail.entryHash && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => onViewSource(detail.entryHash!)}>
                                <FileCodeIcon /> View source
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}
