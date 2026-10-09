"use client";

import { useMemo, useState } from "react";
import type { TreeNode } from "@/lib/api/types";
import { accountLeaf, formatNumber, precisionFor, primaryUnit } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChartEmpty, seriesColor, UnitScopeNote } from "./chart-primitives";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Leaf {
  account: string;
  value: number;
  color: string;
  rect: Rect;
}

/** Squarified treemap layout (Bruls et al.) over a list of weights. */
function squarify(items: Array<{ key: string; value: number }>, rect: Rect): Map<string, Rect> {
  const out = new Map<string, Rect>();
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total <= 0 || items.length === 0) return out;
  let { x, y, w, h } = rect;
  let remaining = items.map((i) => ({ ...i, area: (i.value / total) * rect.w * rect.h }));
  while (remaining.length > 0) {
    const horizontal = w >= h;
    const side = horizontal ? h : w;
    let row: typeof remaining = [];
    let best = Infinity;
    for (const item of remaining) {
      const candidate = [...row, item];
      const area = candidate.reduce((s, i) => s + i.area, 0);
      const max = Math.max(...candidate.map((i) => i.area));
      const min = Math.min(...candidate.map((i) => i.area));
      const worst = Math.max((side * side * max) / (area * area), (area * area) / (side * side * min));
      if (worst <= best) {
        row = candidate;
        best = worst;
      } else break;
    }
    const rowArea = row.reduce((s, i) => s + i.area, 0);
    const thickness = side > 0 ? rowArea / side : 0;
    let offset = 0;
    for (const item of row) {
      const length = thickness > 0 ? item.area / thickness : 0;
      out.set(item.key, horizontal ? { x, y: y + offset, w: thickness, h: length } : { x: x + offset, y, w: length, h: thickness });
      offset += length;
    }
    if (horizontal) {
      x += thickness;
      w -= thickness;
    } else {
      y += thickness;
      h -= thickness;
    }
    remaining = remaining.slice(row.length);
  }
  return out;
}

/**
 * Account hierarchy as a treemap: first-level children get a colour slot, leaves nest inside.
 * Uses one unit only (the most used) and lists the omitted units below.
 */
export function HierarchyTreemap({
  node,
  unit,
  precisions,
  height = 300,
  invert = false,
  onSelect,
  className,
}: {
  node: TreeNode;
  unit?: string;
  precisions?: Record<string, number>;
  height?: number;
  invert?: boolean;
  onSelect?: (account: string) => void;
  className?: string;
}) {
  const [hover, setHover] = useState<Leaf | null>(null);
  const width = 1000;
  const chartUnit = useMemo(() => primaryUnit([node.balanceChildren, ...node.children.map((c) => c.balanceChildren)], unit), [node, unit]);
  const omitted = useMemo(() => Object.keys(node.balanceChildren).filter((u) => u !== chartUnit).sort(), [node, chartUnit]);

  const { leaves, groups } = useMemo(() => {
    if (!chartUnit) return { leaves: [] as Leaf[], groups: [] as Array<{ account: string; color: string; rect: Rect }> };
    const sign = invert ? -1 : 1;
    const weight = (n: TreeNode) => Math.max(0, sign * (n.balanceChildren[chartUnit] ?? 0));
    const topLevel = node.children.filter((c) => weight(c) > 0).sort((a, b) => weight(b) - weight(a));
    const ownRemainder = Math.max(0, sign * (node.balance[chartUnit] ?? 0));
    const items = topLevel.map((c) => ({ key: c.account, value: weight(c) }));
    if (ownRemainder > 0) items.push({ key: node.account, value: ownRemainder });
    const layout = squarify(items, { x: 0, y: 0, w: width, h: height });
    const leaves: Leaf[] = [];
    const groups: Array<{ account: string; color: string; rect: Rect }> = [];
    topLevel.forEach((child, i) => {
      const rect = layout.get(child.account);
      if (!rect) return;
      const color = seriesColor(i);
      groups.push({ account: child.account, color, rect });
      const collect = (n: TreeNode): Array<{ key: string; value: number }> => {
        const kids = n.children.filter((k) => weight(k) > 0);
        const own = Math.max(0, sign * (n.balance[chartUnit] ?? 0));
        if (kids.length === 0) return [{ key: n.account, value: weight(n) }];
        const out = kids.flatMap(collect);
        if (own > 0) out.push({ key: n.account, value: own });
        return out;
      };
      const inner = squarify(collect(child), { x: rect.x + 2, y: rect.y + 2, w: Math.max(0, rect.w - 4), h: Math.max(0, rect.h - 4) });
      for (const [key, r] of inner) leaves.push({ account: key, value: sign * 0 + (collect(child).find((c) => c.key === key)?.value ?? 0), color, rect: r });
    });
    const own = layout.get(node.account);
    if (own) leaves.push({ account: node.account, value: ownRemainder, color: seriesColor(topLevel.length), rect: own });
    return { leaves, groups };
  }, [node, chartUnit, invert, height]);

  if (!chartUnit || leaves.length === 0) return <ChartEmpty />;
  const digits = precisionFor(chartUnit, precisions);
  const total = leaves.reduce((s, l) => s + l.value, 0);

  return (
    <div className={cn("relative", className)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" style={{ maxHeight: height }} role="img" aria-label={`${node.account || "Accounts"} by ${chartUnit}`}>
        {groups.map((g) => (
          <rect key={g.account} x={g.rect.x} y={g.rect.y} width={g.rect.w} height={g.rect.h} fill={g.color} fillOpacity={0.12} rx={6} />
        ))}
        {leaves.map((leaf) => {
          const big = leaf.rect.w > 90 && leaf.rect.h > 34;
          const pct = total > 0 ? (leaf.value / total) * 100 : 0;
          return (
            <g
              key={leaf.account}
              onMouseEnter={() => setHover(leaf)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(leaf.account)}
              className={cn("transition-opacity", hover && hover.account !== leaf.account && "opacity-60", onSelect && "cursor-pointer")}
            >
              <rect x={leaf.rect.x + 1} y={leaf.rect.y + 1} width={Math.max(0, leaf.rect.w - 2)} height={Math.max(0, leaf.rect.h - 2)} fill={leaf.color} fillOpacity={hover?.account === leaf.account ? 0.95 : 0.78} rx={4} stroke="var(--card)" strokeWidth={2} />
              {big && (
                <>
                  <text x={leaf.rect.x + 10} y={leaf.rect.y + 20} fontSize={13} fontWeight={600} fill="#fff" style={{ pointerEvents: "none" }}>
                    {accountLeaf(leaf.account).slice(0, Math.max(3, Math.floor(leaf.rect.w / 8)))}
                  </text>
                  <text x={leaf.rect.x + 10} y={leaf.rect.y + 36} fontSize={11} fill="rgba(255,255,255,0.85)" style={{ pointerEvents: "none" }}>
                    {pct.toFixed(1)}%
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute top-2 right-2 rounded-lg border bg-popover/95 px-3 py-2 text-xs shadow-float backdrop-blur">
          <div className="font-mono font-medium text-foreground">{hover.account}</div>
          <div className="tabular text-muted-foreground">
            {formatNumber(hover.value, digits)} {chartUnit} · {total > 0 ? ((hover.value / total) * 100).toFixed(1) : "0"}%
          </div>
        </div>
      )}
      <UnitScopeNote unit={chartUnit} omitted={omitted} />
    </div>
  );
}
