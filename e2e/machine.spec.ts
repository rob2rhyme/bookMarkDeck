import { test, expect } from "@playwright/test";

// Requests that arrive WITHOUT a session cookie by design: webhooks from QStash
// and Lemon Squeezy, and the PWA files the browser fetches credential-less.
// The root middleware used to send every one of them to /login with a 307
// before the route ran, so background push and billing silently never worked
// in production. Route-handler unit tests cannot see that — they call the
// handler directly, past the middleware — so this is the layer that has to
// assert it.
//
// A fresh `request` context carries no cookies, and maxRedirects: 0 makes a
// 307 visible instead of following it to the login page.
test.describe("cookieless machine requests reach their route", () => {
  for (const path of ["/api/push/fire", "/api/billing/webhook"]) {
    test(`POST ${path} is answered by the route, not redirected`, async ({
      playwright,
      baseURL,
    }) => {
      const ctx = await playwright.request.newContext({ baseURL });
      const res = await ctx.post(path, {
        data: { forged: true },
        headers: { "upstash-signature": "forged", "x-signature": "forged" },
        maxRedirects: 0,
      });
      // The route's own gate must be what answers: 401 for a bad signature, or
      // 503 where the test server has no push keys. Never a redirect, never 200.
      expect(res.status(), `${path} -> ${res.headers()["location"] ?? ""}`).not.toBe(307);
      expect([401, 503]).toContain(res.status());
      await ctx.dispose();
    });
  }

  // The allowlist must stay narrow. Neighbouring routes a user calls with a
  // cookie are still gated, so a route that forgets its own check is covered.
  for (const path of ["/api/push/schedule", "/api/push/fire/extra", "/api/billing/checkout"]) {
    test(`POST ${path} without a session is still sent to /login`, async ({
      playwright,
      baseURL,
    }) => {
      const ctx = await playwright.request.newContext({ baseURL });
      const res = await ctx.post(path, { data: {}, maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(res.headers()["location"]).toMatch(/\/login/);
      await ctx.dispose();
    });
  }

  for (const [path, type] of [
    ["/manifest.webmanifest", "application/manifest+json"],
    ["/sw.js", "javascript"],
    ["/offline.html", "text/html"],
    ["/icons/icon-192.png", "image/png"],
  ] as const) {
    test(`GET ${path} is served without a session`, async ({ playwright, baseURL }) => {
      const ctx = await playwright.request.newContext({ baseURL });
      const res = await ctx.get(path, { maxRedirects: 0 });
      expect(res.status(), `${path} -> ${res.headers()["location"] ?? ""}`).toBe(200);
      expect(res.headers()["content-type"]).toContain(type);
      await ctx.dispose();
    });
  }
});
