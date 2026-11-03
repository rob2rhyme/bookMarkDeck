import { test, expect } from "./fixtures/session";

// Every cloud-backed page tells you the same thing the same way when it isn't
// synced: where your data lives, and one "Sign in to sync" button. (Bookmarks
// syncs by hand and keeps its own controls.)
const PAGES: [path: string, sentence: RegExp][] = [
  ["/focus", /Your focus data stays on this device\./],
  ["/inventory", /Your inventory stays on this device\./],
  ["/filing", /Your filing log stays on this device\./],
  ["/notes", /Your notes stay on this device\./],
  ["/habits", /Your habits stay on this device\./],
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("bd:ui-flags:v1", JSON.stringify({ welcomeSeen: true, habitsOnboarded: true }));
  });
});

for (const [path, sentence] of PAGES) {
  test(`${path} shows the shared sync banner`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByText(sentence)).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in to sync" })).toBeVisible();
  });
}
