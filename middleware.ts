// middleware.ts
import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

// Protect all routes except Next internals/assets and let unauthenticated users hit /login.
export default withAuth(
  function middleware(req) {
    const isLogin = req.nextUrl.pathname === "/login";
    const isAuthed = !!req.nextauth.token;

    if (isAuthed && isLogin) {
      return NextResponse.redirect(new URL("/", req.nextUrl));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const publicPaths = ["/login", "/privacy", "/terms", "/faq"];
        if (publicPaths.includes(req.nextUrl.pathname)) return true;
        return !!token;
      },
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png).*)"],
};
