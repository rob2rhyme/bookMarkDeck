import { expect, test } from "./fixtures/session";

// The Content-Security-Policy (next.config.ts) names its script hosts instead of
// allowing any https: origin. A policy that is too tight fails silently in the
// browser — nothing throws in the app, a feature just stops — so this walks the
// pages and fails on any violation they raise. It is also what caught the old
// policy refusing Tesseract's blob: worker, which broke on-device OCR.

const PAGES = ["/", "/focus", "/habits", "/inventory", "/filing", "/notes", "/guide", "/faq", "/privacy"];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = seen;
    document.addEventListener("securitypolicyviolation", (e) => {
      seen.push(`${e.effectiveDirective} ← ${e.blockedURI}`);
    });
  });
});

const violations = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

for (const path of PAGES) {
  test(`${path} raises no CSP violations`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await violations(page)).toEqual([]);
  });
}

test("a blob: worker is allowed (Tesseract's OCR worker starts this way)", async ({ page }) => {
  await page.goto("/inventory");
  const result = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const w = new Worker(URL.createObjectURL(new Blob(["postMessage('ok')"], { type: "text/javascript" })));
        w.onmessage = (e) => resolve(String(e.data));
        w.onerror = () => resolve("refused");
        setTimeout(() => resolve("timeout"), 5000);
      })
  );
  expect(result).toBe("ok");
});

test("a script from an unlisted host is refused", async ({ page }) => {
  await page.goto("/notes");
  await page.evaluate(() => {
    const s = document.createElement("script");
    s.src = "https://evil.example/x.js";
    document.head.appendChild(s);
  });
  await expect.poll(() => violations(page)).toContainEqual(expect.stringMatching(/^script-src-elem ← https:\/\/evil\.example/));
});
