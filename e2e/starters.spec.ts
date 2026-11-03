import { test, expect } from "./fixtures/session";

// Habits-style starters for an empty Bookmarks library and an empty Focus task
// list: offered from the empty state (never opened on their own), each pick added
// in one go. The first-run welcome is marked seen so it can't cover the page.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bd:ui-flags:v1", JSON.stringify({ welcomeSeen: true }));
  });
});

test("an empty library can start with a few links, filed into folders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("No bookmarks yet.")).toBeVisible();
  await page.getByRole("button", { name: "Or start with a few popular sites" }).click();

  const picker = page.getByRole("dialog", { name: "Start with a few links" });
  await picker.getByRole("button", { name: /GitHub/ }).click();
  await picker.getByRole("button", { name: /MDN Web Docs/ }).click();
  await picker.getByRole("button", { name: /Gmail/ }).click();
  await picker.getByRole("button", { name: "Add 3 links" }).click();
  await expect(picker).toBeHidden();

  // The library is no longer empty, and its picks sit in folders named for their kind.
  await expect(page.getByText("No bookmarks yet.")).toHaveCount(0);
  await expect(page.getByText("Dev", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Mail & calendar", { exact: true }).first()).toBeVisible();
});

test("an empty Focus task list can start with a few tasks", async ({ page }) => {
  await page.goto("/focus");
  await page.getByRole("button", { name: "Or start with a few common ones" }).click();

  const picker = page.getByRole("dialog", { name: "Start with a few tasks" });
  await picker.getByRole("button", { name: "Writing", exact: true }).click();
  await picker.getByRole("button", { name: "Reading", exact: true }).click();
  await picker.getByRole("button", { name: "Add 2 tasks" }).click();
  await expect(picker).toBeHidden();

  await expect(page.getByText("Writing", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Reading", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Or start with a few common ones" })).toHaveCount(0);
});
