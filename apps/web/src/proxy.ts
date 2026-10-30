import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "bs_session";
// Invite links are public: what they offer is shown before signing in, and the link is the secret.
const PUBLIC_PREFIXES = ["/login", "/sign-up", "/forgot-password", "/reset-password", "/invite", "/icon.svg"];

/** A `next` value may only point inside this site (mirrors src/lib/routes.ts, which the edge cannot import). */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl;
  const signedIn = request.cookies.has(SESSION_COOKIE);
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (signedIn && (pathname === "/login" || pathname === "/sign-up")) {
      return NextResponse.redirect(new URL(safeNext(searchParams.get("next")), request.url));
    }
    return NextResponse.next();
  }
  if (pathname === "/") {
    // Signed in, the page itself picks the workspace to open.
    return signedIn ? NextResponse.next() : NextResponse.redirect(new URL("/login", request.url));
  }
  // Public ledgers are readable anonymously; the API decides. Everything else needs a session cookie.
  if (!signedIn && !pathname.startsWith("/w/") && !pathname.startsWith("/u/")) {
    const next = encodeURIComponent(`${pathname}${search}`);
    return NextResponse.redirect(new URL(`/login?next=${next}`, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|ico|webp)$).*)"],
};
