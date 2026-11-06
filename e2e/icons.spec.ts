import { E2E_USER, expect, test } from "./fixtures/session";

// Icons used to come from Google's icon service, so Google saw the domain of every
// bookmark (and, as a fallback, the site saw the user's own browser). They now come
// from our route, which fetches them server-side.
test("bookmark icons come from our own route, never Google's icon service", async ({ page }) => {
  await page.addInitScript(
    ({ email }) => {
      localStorage.setItem("bd:ui-flags:v1", JSON.stringify({ welcomeSeen: true }));
      localStorage.setItem(
        `bookmarkdeck:v2:${email}`,
        JSON.stringify({
          version: 2,
          bookmarks: [
            { id: "b1", title: "Example", url: "https://example.com/page", createdAt: "2026-01-01T00:00:00.000Z", tags: [], pinned: false, folderId: null },
          ],
          folders: [],
        })
      );
    },
    { email: E2E_USER.email }
  );
  const google: string[] = [];
  page.on("request", (r) => {
    if (/google\.com\/s2\/favicons|example\.com\/favicon\.ico/.test(r.url())) google.push(r.url());
  });
  const asked = page.waitForRequest((r) => r.url().includes("/api/icon?host=example.com"));
  await page.goto("/folders/unstaged");
  await asked;
  await page.waitForLoadState("networkidle");
  expect(google).toEqual([]);
});
