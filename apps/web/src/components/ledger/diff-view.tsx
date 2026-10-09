"use client";

import { useMemo, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiffLine {
  kind: "add" | "del" | "ctx" | "hunk" | "meta";
  text: string;
  oldNo?: number;
  newNo?: number;
}

export function parseUnifiedDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++") || raw.startsWith("---") || raw.startsWith("diff ") || raw.startsWith("index ")) {
      lines.push({ kind: "meta", text: raw });
      continue;
    }
    const hunk = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      lines.push({ kind: "hunk", text: raw });
      continue;
    }
    if (raw.startsWith("+")) {
      lines.push({ kind: "add", text: raw.slice(1), newNo: newNo++ });
    } else if (raw.startsWith("-")) {
      lines.push({ kind: "del", text: raw.slice(1), oldNo: oldNo++ });
    } else if (raw.startsWith("\\")) {
      lines.push({ kind: "meta", text: raw });
    } else if (raw.length > 0 || lines.length > 0) {
      lines.push({ kind: "ctx", text: raw.slice(1), oldNo: oldNo++, newNo: newNo++ });
    }
  }
  return lines;
}

/** A unified diff rendered as a compact, colour-coded block (no external deps). */
export function DiffView({ path, diff, compact = false, defaultOpen = true, className }: { path: string; diff: string; compact?: boolean; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const lines = useMemo(() => parseUnifiedDiff(diff).filter((l) => l.kind !== "meta"), [diff]);
  const adds = lines.filter((l) => l.kind === "add").length;
  const dels = lines.filter((l) => l.kind === "del").length;
  return (
    <div className={cn("overflow-hidden rounded-lg border", className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 bg-surface/80 px-3 py-1.5 text-left text-xs hover:bg-muted" aria-expanded={open}>
        <ChevronDownIcon className={cn("size-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        <span className="font-mono font-medium">{path}</span>
        <span className="ml-auto flex gap-2 tabular">
          {adds > 0 && <span className="text-positive">+{adds}</span>}
          {dels > 0 && <span className="text-negative">−{dels}</span>}
          {adds === 0 && dels === 0 && <span className="text-muted-foreground">no changes</span>}
        </span>
      </button>
      {open && lines.length > 0 && (
        <div className={cn("overflow-x-auto font-mono text-[12px] leading-5", compact ? "max-h-72" : "max-h-[60vh]", "overflow-y-auto scrollbar-thin")}>
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line, i) => (
                <tr
                  key={i}
                  className={cn(
                    line.kind === "add" && "bg-positive/10",
                    line.kind === "del" && "bg-negative/10",
                    line.kind === "hunk" && "bg-muted/60 text-muted-foreground",
                  )}
                >
                  <td className="w-10 select-none pr-2 text-right text-[11px] text-muted-foreground/70">{line.oldNo ?? ""}</td>
                  <td className="w-10 select-none pr-2 text-right text-[11px] text-muted-foreground/70">{line.newNo ?? ""}</td>
                  <td className={cn("w-4 select-none text-center", line.kind === "add" && "text-positive", line.kind === "del" && "text-negative")}>{line.kind === "add" ? "+" : line.kind === "del" ? "−" : ""}</td>
                  <td className="whitespace-pre pr-3">{line.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
