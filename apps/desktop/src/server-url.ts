/**
 * Pure helpers for the server address a person connects the shell to.
 * No Electron imports: unit-tested with node:test.
 */

export class ServerUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerUrlError";
  }
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Turns what a person typed into a server origin. `https://` is assumed when no scheme is given
 * (plain `http://` for localhost); any path, query, fragment or credentials are dropped.
 */
export function normalizeServerUrl(input: string): string {
  const typed = input.trim();
  if (!typed) {
    throw new ServerUrlError("Enter the address of your Beancount Studio server.");
  }
  const candidate = HAS_SCHEME.test(typed) ? typed : `https://${typed}`;
  if (!URL.canParse(candidate)) {
    throw new ServerUrlError(`"${typed}" is not a valid server address.`);
  }
  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ServerUrlError("The server address must start with http:// or https://.");
  }
  if (!HAS_SCHEME.test(typed) && LOCAL_HOSTS.has(url.hostname)) {
    url.protocol = "http:";
  }
  return url.origin;
}

/** True when `url` is on the connected server's origin. Unparseable strings are not on the server. */
export function isOnServer(url: string, serverOrigin: string): boolean {
  return URL.canParse(url) && new URL(url).origin === serverOrigin;
}

/** Health endpoint checked before a server address is saved. */
export function healthUrl(serverOrigin: string): string {
  return `${serverOrigin}/api/healthz`;
}
