/**
 * Browser-based sign-in, the way Slack does it. The shell never shows a login form: it opens the
 * server's web app in the default browser, the person signs in and approves there, and the shell
 * redeems a secret for a session. Pure helpers only; the flow itself lives in main.ts.
 */

import { createHash, randomBytes } from "node:crypto";

export const DEEP_LINK_SCHEME = "beancount-studio";

const CHALLENGE = /^[0-9a-f]{64}$/;
const AUTH_PAGES = new Set(["/login", "/sign-up", "/forgot-password", "/reset-password"]);

export interface SignInChallenge {
  /** Stays in the shell; redeemed for a session once the browser has approved. */
  readonly verifier: string;
  /** SHA-256 of the verifier; the only part that travels to the browser. */
  readonly challenge: string;
}

export function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("hex");
}

export function createSignInChallenge(): SignInChallenge {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: challengeFor(verifier) };
}

/** The page the browser opens; `deepLink` tells it the shell can be returned to via the URL scheme. */
export function signInUrl(serverOrigin: string, challenge: string, deepLink: boolean): string {
  const url = new URL("/desktop/sign-in", serverOrigin);
  url.searchParams.set("challenge", challenge);
  if (deepLink) url.searchParams.set("deeplink", "1");
  return url.href;
}

/** Challenge carried by `beancount-studio://signed-in?challenge=…`, or null for anything else. */
export function parseSignedInDeepLink(url: string): string | null {
  if (!URL.canParse(url)) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== `${DEEP_LINK_SCHEME}:` || parsed.host !== "signed-in") return null;
  const challenge = parsed.searchParams.get("challenge") ?? "";
  return CHALLENGE.test(challenge) ? challenge : null;
}

/** True for the server's own sign-in pages, which the shell replaces with the browser flow. */
export function isAuthPage(url: string, serverOrigin: string): boolean {
  if (!URL.canParse(url)) return false;
  const parsed = new URL(url);
  return parsed.origin === serverOrigin && AUTH_PAGES.has(parsed.pathname);
}
