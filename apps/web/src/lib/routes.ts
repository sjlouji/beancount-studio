/** Web addresses (not API paths) for workspaces and ledgers, and the person's last workspace. */

export function workspaceHref(workspace: string): string {
  return `/w/${workspace}`;
}

export function ledgerHref(workspace: string, slug: string): string {
  return `/w/${workspace}/${slug}`;
}

/** A `next` query value may only point inside this site. */
export function safeNext(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

const LAST_WORKSPACE_KEY = "bs.workspace";

/** The workspace opened last in this browser, so `/` and the account pages land somewhere familiar. */
export function rememberedWorkspace(): string | null {
  try {
    return window.localStorage.getItem(LAST_WORKSPACE_KEY);
  } catch {
    return null; // storage can be blocked; the first workspace then stands in
  }
}

export function rememberWorkspace(slug: string): void {
  try {
    window.localStorage.setItem(LAST_WORKSPACE_KEY, slug);
  } catch {
    /* storage can be blocked; there is nothing to remember then */
  }
}
