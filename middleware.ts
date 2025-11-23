import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_COOKIE = "bookmarkdeck_auth";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/logo.png");

  if (isPublicAsset) {
    return NextResponse.next();
  }

  const isAuthRoute = pathname === "/login";
  const isAuthenticated = request.cookies.get(AUTH_COOKIE)?.value === "true";

  if (!isAuthenticated && !isAuthRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && isAuthRoute) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/(login)?", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
