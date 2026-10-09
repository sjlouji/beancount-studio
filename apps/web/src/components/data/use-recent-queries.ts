"use client";

import { useCallback, useState } from "react";

const MAX_RECENT = 10;

function storageKey(owner: string, slug: string): string {
  return `beancount-studio:recent-queries:${owner}/${slug}`;
}

function load(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === "string").slice(0, MAX_RECENT) : [];
  } catch (error) {
    console.warn("recent queries: could not read localStorage", error);
    return [];
  }
}

/** The last 10 distinct queries run in this ledger, newest first, persisted in localStorage. */
export function useRecentQueries(owner: string, slug: string) {
  const key = storageKey(owner, slug);
  // Ledger pages render only after client-side data loads, so reading storage here is hydration-safe.
  const [recent, setRecent] = useState<string[]>(() => load(key));

  const remember = useCallback(
    (query: string) => {
      const text = query.trim();
      if (!text) return;
      setRecent((prev) => {
        const next = [text, ...prev.filter((q) => q !== text)].slice(0, MAX_RECENT);
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch (error) {
          console.warn("recent queries: could not write localStorage", error);
        }
        return next;
      });
    },
    [key],
  );

  const clear = useCallback(() => {
    setRecent([]);
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      console.warn("recent queries: could not clear localStorage", error);
    }
  }, [key]);

  return { recent, remember, clear };
}
