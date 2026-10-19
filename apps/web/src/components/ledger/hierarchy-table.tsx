"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState, type ReactNode } from "react";
import { BalanceAmounts } from "@/components/app/amount";
import { Button } from "@/components/ui/button";
import type { Balance, TreeNode } from "@/lib/api/types";
import { accountLeaf } from "@/lib/format";
import { cn } from "@/lib/utils";
import { accountHref, useLedgerContext } from "./ledger-context";

export interface SummaryRow {
  label: string;
  balance: Balance;
  emphasis?: boolean;
}

function collectExpanded(node: TreeNode, depth: number, out: Set<string>, level = 0) {
  if (level < depth) {
    out.add(node.account);
    for (const child of node.children) collectExpanded(child, depth, out, level + 1);
  }
}

function hasValue(balance: Balance): boolean {
  return Object.values(balance).some((v) => v !== 0);
}

/**
 * The tree table used by every statement: account rows link to the account page, balances
 * are shown per unit, and totals go below the detail rows as plain summary rows.
 */
export function HierarchyTable({
  root,
  title,
  invert = false,
  initialDepth = 2,
  hideRoot = false,
  summaryRows = [],
  showZero = false,
  action,
  className,
}: {
  root: TreeNode;
  title: ReactNode;
  invert?: boolean;
  initialDepth?: number;
  hideRoot?: boolean;
  summaryRows?: SummaryRow[];
  showZero?: boolean;
  action?: ReactNode;
  className?: string;
}) {
  const { base, queryString, precisions } = useLedgerContext();
  const headingId = useId();
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const set = new Set<string>();
    collectExpanded(root, initialDepth, set);
    return set;
  });

  const rows = useMemo(() => {
    const out: Array<{ node: TreeNode; level: number; hasChildren: boolean }> = [];
    const walk = (node: TreeNode, level: number) => {
      const children = node.children.filter((c) => showZero || hasValue(c.balanceChildren) || c.hasTxns);
      if (!(hideRoot && level === 0)) out.push({ node, level, hasChildren: children.length > 0 });
      if (expanded.has(node.account) || (hideRoot && level === 0)) {
        for (const child of children) walk(child, hideRoot ? level : level + 1);
      }
    };
    walk(root, 0);
    return out;
  }, [root, expanded, hideRoot, showZero]);

  const toggle = (account: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(account)) next.delete(account);
      else next.add(account);
      return next;
    });

  const expandAll = () => {
    const set = new Set<string>();
    collectExpanded(root, 99, set);
    setExpanded(set);
  };
  const collapseAll = () => setExpanded(new Set([root.account]));

  return (
    <section className={cn("overflow-hidden rounded-xl border bg-card", className)} aria-labelledby={headingId}>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <h3 id={headingId} className="text-sm font-medium">
          {title}
        </h3>
        <div className="flex items-center gap-1">
          {action}
          <Button variant="ghost" size="xs" onClick={expandAll}>
            Expand
          </Button>
          <Button variant="ghost" size="xs" onClick={collapseAll}>
            Collapse
          </Button>
        </div>
      </header>
      <table className="w-full text-sm" aria-labelledby={headingId}>
        <thead className="sr-only">
          <tr>
            <th scope="col">Account</th>
            <th scope="col">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ node, level, hasChildren }) => {
            const isOpen = expanded.has(node.account);
            const own = hasValue(node.balance);
            return (
              <tr key={node.account} className={cn("group border-b last:border-0 hover:bg-muted/40", level === 0 && "bg-surface/60 font-medium")}>
                <th scope="row" className="py-1.5 pr-3 pl-3 text-left font-normal" style={{ paddingLeft: `${0.75 + level * 1.1}rem` }}>
                  <span className="flex items-center gap-1">
                    {hasChildren ? (
                      <button type="button" onClick={() => toggle(node.account)} aria-expanded={isOpen} aria-label={isOpen ? "Collapse" : "Expand"} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <ChevronRightIcon className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} />
                      </button>
                    ) : (
                      <span className="inline-block size-4.5" />
                    )}
                    <Link href={accountHref(base, node.account, queryString)} className={cn("truncate font-mono text-[13px] hover:underline", level === 0 && "font-sans text-sm font-medium")}>
                      {level === 0 ? node.account : accountLeaf(node.account)}
                    </Link>
                    {hasChildren && !isOpen && own && <span className="text-[10px] text-muted-foreground">+own</span>}
                  </span>
                </th>
                <td className="py-1.5 pr-4 text-right">
                  <BalanceAmounts balance={isOpen && hasChildren ? node.balance : node.balanceChildren} precisions={precisions} invert={invert} emptyLabel="" />
                </td>
              </tr>
            );
          })}
          {summaryRows.map((row) => (
            <tr key={row.label} className={cn("border-t bg-surface/60", row.emphasis && "font-semibold")}>
              <td className="py-2 pl-3 text-sm">{row.label}</td>
              <td className="py-2 pr-4 text-right">
                <BalanceAmounts balance={row.balance} precisions={precisions} invert={invert} colored={row.emphasis} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Add two balance maps. */
export function addBalances(a: Balance, b: Balance): Balance {
  const out: Balance = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
}

export function negate(balance: Balance): Balance {
  const out: Balance = {};
  for (const [k, v] of Object.entries(balance)) out[k] = -v;
  return out;
}
