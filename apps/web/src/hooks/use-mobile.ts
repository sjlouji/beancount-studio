import { useSyncExternalStore } from "react";

/** True while the viewport matches `query`; false during server rendering. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Wide enough for the sidebar, the content and the Ask panel side by side. */
export function useIsWide(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
