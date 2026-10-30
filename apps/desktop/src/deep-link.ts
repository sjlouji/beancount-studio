/**
 * Links that open a page of the connected server in the shell: `beancount-studio://w/ada/books`
 * opens `/w/ada/books`, `beancount-studio://invite/<token>` the invite page. Pure helpers, unit
 * tested with node:test; the sign-in link has its own parser in sign-in.ts.
 */

/** The app's URL scheme, registered in electron-builder.yml. */
export const DEEP_LINK_SCHEME = "beancount-studio";

/** The page roots a deep link may open; anything else is ignored, so a link can only land inside the app. */
const OPENABLE_ROOTS = new Set(["w", "invite", "new", "settings", "u"]);

/**
 * The server-relative path carried by an open link (root, path, query and fragment), or null for
 * links the shell does not open. The server's origin is never part of a link: the shell only ever
 * opens pages of the server it is connected to.
 */
export function parseOpenDeepLink(url: string): string | null {
  if (!URL.canParse(url)) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== `${DEEP_LINK_SCHEME}:` || !OPENABLE_ROOTS.has(parsed.host)) return null;
  if (parsed.username || parsed.password) return null;
  return `/${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/** A path the shell may load on the server: absolute, and not a scheme-relative URL in disguise. */
export function isServerPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");
}
