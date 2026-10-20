import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "bs_session";
const PUBLIC_PREFIXES = ["/login", "/sign-up", "/forgot-password", "/reset-password", "/icon.svg"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = request.cookies.has(SESSION_COOKIE);
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (signedIn && (pathname === "/login" || pathname === "/sign-up")) {
      return NextResponse.redirect(new URL("/ledgers", request.url));
    }
    return NextResponse.next();
  }
  if (pathname === "/") {
    return NextResponse.redirect(new URL(signedIn ? "/ledgers" : "/login", request.url));
  }
  // Public ledgers are readable anonymously; the API decides. Everything else needs a session cookie.
  if (!signedIn && !pathname.startsWith("/ledger/") && !pathname.startsWith("/u/")) {
    const next = encodeURIComponent(`${pathname}${search}`);
    return NextResponse.redirect(new URL(`/login?next=${next}`, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|ico|webp)$).*)"],
};
