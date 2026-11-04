"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useReportParams } from "@/hooks/use-report-params";
import { useLedgerAttributes, useLedgerMeta } from "@/lib/api/hooks";
import type { Ledger, LedgerAttributes, LedgerMeta, ReportParams } from "@/lib/api/types";

/** The assistant panel beside the content: open or not, and which conversation. */
export interface LedgerContextValue {
  workspace: string;
  slug: string;
  /** `/w/<workspace>/<slug>` */
  base: string;
  ledger: Ledger;
  meta: LedgerMeta | undefined;
  attributes: LedgerAttributes | undefined;
  params: ReportParams;
  setParams: ReturnType<typeof useReportParams>["setParams"];
  clearFilters: () => void;
  queryString: string;
  hasFilters: boolean;
  /** Conversion to use for reports: URL param, else the first operating currency. */
  conversion: string;
  precisions: Record<string, number>;
  canWrite: boolean;
  invert: boolean;
  /** Link to a ledger page, carrying the shared filters. */
  href: (path: string, extra?: Record<string, string | undefined>) => string;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function useLedgerContext(): LedgerContextValue {
  const value = useContext(LedgerContext);
  if (!value) throw new Error("useLedgerContext must be used inside a ledger route");
  return value;
}

export function LedgerProvider({ workspace, slug, ledger, children }: { workspace: string; slug: string; ledger: Ledger; children: ReactNode }) {
  const { data: meta } = useLedgerMeta(workspace, slug);
  const { data: attributes } = useLedgerAttributes(workspace, slug);
  const { params, setParams, clear, queryString, hasFilters } = useReportParams();
  const base = `/w/${workspace}/${slug}`;


  const value = useMemo<LedgerContextValue>(() => {
    const conversion = params.conversion || meta?.operatingCurrencies[0] || "at_cost";
    return {
      workspace,
      slug,
      base,
      ledger,
      meta,
      attributes,
      params,
      setParams,
      clearFilters: clear,
      queryString,
      hasFilters,
      conversion,
      precisions: meta?.precisions ?? {},
      canWrite: ledger.canWrite,
      invert: meta?.favaOptions.invertIncomeLiabilitiesEquity ?? false,
      href: (path, extra) => {
        const search = new URLSearchParams(queryString.replace(/^\?/, ""));
        for (const [key, val] of Object.entries(extra ?? {})) {
          if (val) search.set(key, val);
          else search.delete(key);
        }
        const text = search.toString();
        return `${base}${path}${text ? `?${text}` : ""}`;
      },
    };
  }, [workspace, slug, base, ledger, meta, attributes, params, setParams, clear, queryString, hasFilters]);

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function accountHref(base: string, account: string, queryString = ""): string {
  return `${base}/account/${account.split(":").map(encodeURIComponent).join(":")}${queryString}`;
}
