"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { ReportParams } from "@/lib/api/types";

const KEYS = ["time", "account", "filter", "conversion", "interval"] as const;

/** Shared ledger filters live in the URL so every report page agrees on the scope. */
export function useReportParams(defaults: Partial<ReportParams> = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const params = useMemo<ReportParams>(() => {
    const out: ReportParams = { ...defaults };
    for (const key of KEYS) {
      const value = search.get(key);
      if (value) (out as Record<string, string>)[key] = value;
    }
    return out;
  }, [search, defaults]);

  const setParams = useCallback(
    (patch: Partial<Record<(typeof KEYS)[number], string | undefined>>, options: { replace?: boolean } = {}) => {
      const next = new URLSearchParams(search.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (!value) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      if (options.replace === false) router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [search, pathname, router],
  );

  const clear = useCallback(() => setParams({ time: undefined, account: undefined, filter: undefined }), [setParams]);

  /** Query string carrying the shared filters, for links between ledger pages. */
  const queryString = useMemo(() => {
    const next = new URLSearchParams();
    for (const key of KEYS) {
      const value = search.get(key);
      if (value) next.set(key, value);
    }
    const text = next.toString();
    return text ? `?${text}` : "";
  }, [search]);

  const hasFilters = Boolean(params.time || params.account || params.filter);

  return { params, setParams, clear, queryString, hasFilters };
}
