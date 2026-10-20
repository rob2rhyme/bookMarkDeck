import { test as base, type BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";

import { E2E_SECRET } from "../../playwright.config";

// Signing in for E2E needs no Google round-trip and no real credentials. Every
// authed route gates on `getServerSession(authConfig)`, which only verifies a
// next-auth JWT against NEXTAUTH_SECRET — so a cookie we mint with the same
// secret the test server runs with is indistinguishable from a real one.
// Firebase credentials are a separate concern: they gate live Firestore sync,
// which is opt-in, so the pillars simply render their empty state.

const SESSION_COOKIE = "next-auth.session-token";

export const E2E_USER = {
  name: "E2E User",
  email: "e2e@example.com",
  sub: "e2e-user",
};

/** Mint a session JWT the app will accept. */
export async function sessionToken(user: typeof E2E_USER = E2E_USER): Promise<string> {
  return encode({
    token: {
      ...user,
      // Load-bearing. The jwt callback (src/auth/auth.config.ts) reads:
      //   if (t.expiresAt && Date.now() < t.expiresAt - 60_000) return t;
      //   return refreshAccessToken(t);
      // With no `expiresAt` that first condition is falsy, so it takes the
      // refresh path on EVERY request — a live call to Google's token endpoint
      // with a dummy refresh token, per navigation. Auth still succeeds (the
      // session callback only attaches `session.error`), so it would pass while
      // being slow and dependent on outbound network. A future expiry
      // short-circuits it and keeps the suite hermetic.
      expiresAt: Date.now() + 60 * 60 * 1000,
    },
    secret: E2E_SECRET,
  });
}

/**
 * Add the session cookie to a context. Not the `__Secure-` prefixed name —
 * next-auth only uses that over HTTPS, and the suite runs on http://localhost.
 */
export async function signIn(context: BrowserContext, user: typeof E2E_USER = E2E_USER): Promise<void> {
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: await sessionToken(user),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/** `test` with an already-signed-in context. Use `base` for anonymous specs. */
// The second fixture argument is conventionally named `use`, but that trips
// react-hooks/rules-of-hooks, which reads it as React's `use` hook. The name is
// arbitrary to Playwright, so it is `provide` here — a rename rather than a
// suppression. Don't rename it back.
export const test = base.extend({
  context: async ({ context }, provide) => {
    await signIn(context);
    await provide(context);
  },
});

export { expect } from "@playwright/test";
