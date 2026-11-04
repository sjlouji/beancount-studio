/** Where the window was, so it reopens there — but only where a person can still reach it. */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// How much of the title bar must lie on a display for the window to be grabbable.
const GRAB_WIDTH = 120;
const TITLE_BAR_HEIGHT = 44;

/** The saved value, checked field by field: the settings file is outside our control. */
export function parseBounds(value: unknown): Bounds | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { x, y, width, height } = value as Record<string, unknown>;
  const numbers = [x, y, width, height];
  if (!numbers.every((n): n is number => typeof n === "number" && Number.isFinite(n))) return undefined;
  const [left, top, w, h] = numbers.map(Math.round) as [number, number, number, number];
  if (w <= 0 || h <= 0) return undefined;
  return { x: left, y: top, width: w, height: h };
}

function overlap(a: Bounds, b: Bounds): { width: number; height: number } {
  return {
    width: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    height: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  };
}

/**
 * The saved bounds if the window's title bar would land on one of the displays' work areas, grown
 * to the minimum size; otherwise nothing, and the window opens at its default size and place.
 */
export function restorableBounds(
  saved: Bounds | undefined,
  workAreas: Bounds[],
  minimum: { width: number; height: number },
): Bounds | undefined {
  if (!saved) return undefined;
  const titleBar = { x: saved.x, y: saved.y, width: saved.width, height: TITLE_BAR_HEIGHT };
  const reachable = workAreas.some((area) => {
    const shared = overlap(titleBar, area);
    return shared.width >= Math.min(GRAB_WIDTH, saved.width) && shared.height >= TITLE_BAR_HEIGHT / 2;
  });
  if (!reachable) return undefined;
  return { ...saved, width: Math.max(saved.width, minimum.width), height: Math.max(saved.height, minimum.height) };
}
