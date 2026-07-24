import { test, expect } from "@playwright/test";

// Public surface only — the authenticated app is unreachable without real
// Google/Firebase credentials.
test.describe("public surface", () => {
  test("login page renders the Google sign-in button", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible();
  });

  test("unauthenticated / redirects to /login", async ({ page }) => {
    await page.goto("/");
    // next-auth appends ?callbackUrl=… to the sign-in redirect.
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });

  test("public pages (legal + guides) return 200 without auth", async ({
    page,
  }) => {
    for (const path of ["/privacy", "/terms", "/faq", "/guide", "/habits/guide"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
    }
  });

  test("security headers are present on responses", async ({ page }) => {
    const res = await page.goto("/login");
    const headers = res?.headers() ?? {};
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["permissions-policy"]).toContain("camera=(self)");
    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });
});
