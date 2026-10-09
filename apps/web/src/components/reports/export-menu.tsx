"use client";

import { DownloadIcon, FileSpreadsheetIcon, FileTextIcon, PrinterIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { downloadText, toCsv, toMarkdown, type ExportReport } from "./export";

/**
 * Export dropdown shared by the statements. `build` runs lazily on click so the (flattened)
 * tables are only computed when the user actually exports.
 */
export function ExportMenu({ fileName, build, printable = true }: { fileName: string; build: () => ExportReport; printable?: boolean }) {
  const run = (kind: "csv" | "md") => {
    const report = build();
    if (kind === "csv") downloadText(`${fileName}.csv`, `﻿${toCsv(report.tables)}`, "text/csv;charset=utf-8");
    else downloadText(`${fileName}.md`, toMarkdown(report), "text/markdown;charset=utf-8");
    toast.success(`Exported ${fileName}.${kind}`);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <DownloadIcon data-icon="inline-start" /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => run("csv")}>
          <FileSpreadsheetIcon /> Spreadsheet CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run("md")}>
          <FileTextIcon /> Markdown report
        </DropdownMenuItem>
        {printable && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => window.print()}>
              <PrinterIcon /> Print / Save as PDF
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
