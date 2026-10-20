import { expect, test } from "@playwright/test";

import { signIn } from "./fixtures/session";

// Sign-in is limited to the owner (src/auth/allowlist.ts; the suite's server
// allows only the fixture account). A valid session cookie for any other
// Google account — one minted before the lock, or with a leaked secret — must
// still get nowhere: the gate checks the account, not just the signature.
const STRANGER = { name: "Stranger", email: "stranger@example.com", sub: "stranger" };

test.describe("sign-in allowlist", () => {
  test("another account's session is sent to /login", async ({ context, page }) => {
    await signIn(context, STRANGER);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("another account's session can't reach a gated API route", async ({ context }) => {
    await signIn(context, STRANGER);
    const res = await context.request.get("/api/firebase-token", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toMatch(/\/login/);
  });

  test("the session endpoint reads another account as signed out", async ({ context }) => {
    await signIn(context, STRANGER);
    const res = await context.request.get("/api/auth/session");
    expect(await res.json()).toEqual({});
  });
});

test("a refused sign-in explains itself on /login", async ({ page }) => {
  await page.goto("/login?error=AccessDenied");
  await expect(page.getByText("That account can’t sign in here")).toBeVisible();
});
