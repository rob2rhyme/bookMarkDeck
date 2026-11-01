// middleware.ts
import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

import { isAllowedEmail } from "@/auth/allowlist";
import { returnPath } from "@/utils/returnPath";

// Protect all routes except Next internals/assets and let unauthenticated users hit /login.
export default withAuth(
  function middleware(req) {
    const isLogin = req.nextUrl.pathname === "/login";
    const isAuthed = !!req.nextauth.token && isAllowedEmail(req.nextauth.token.email);

    if (isAuthed && isLogin) {
      // Back to the page that asked for sign-in (a shared link, say), if it's ours.
      const next = returnPath(req.nextUrl.searchParams.get("callbackUrl"), req.nextUrl.origin);
      return NextResponse.redirect(new URL(next, req.nextUrl));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Static docs are public so prospects can see what the app does before
        // signing up (the guide/faq are the pre-signup value pages).
        const publicPaths = [
          "/login",
          "/privacy",
          "/terms",
          "/faq",
          "/guide",
          "/habits/guide",
        ];
        if (publicPaths.includes(req.nextUrl.pathname)) return true;
        // The jwt callback ends a non-owner's session, but the gate reads the
        // cookie without running it — so it checks the account itself.
        return !!token && isAllowedEmail(token.email);
      },
    },
    pages: {
      signIn: "/login",
    },
  }
);

// Excluded from the session gate: Next internals and static assets, plus two
// kinds of request that arrive WITHOUT a session cookie by design.
//   - Webhooks. QStash calls /api/push/fire and Lemon Squeezy calls
//     /api/billing/webhook; each verifies its own signature, and those checks
//     are pinned by route tests. Until this list named them, both got a 307 to
//     /login before their handler ran, so background push and billing silently
//     never worked in production (e2e/machine.spec.ts now guards it).
//   - PWA files the browser fetches credential-less: the manifest, the service
//     worker, the offline page and the icons.
// An explicit allowlist rather than "all of /api": the gate stays a backstop
// for every other route, so one that forgets its own check is still covered.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.png|jellyfish-cursor.svg|manifest.webmanifest|sw.js|offline.html|icons/|api/push/fire$|api/billing/webhook$).*)",
  ],
};
