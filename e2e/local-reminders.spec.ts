import { expect, test } from "./fixtures/session";

// The on-device reminder switch exists only inside the native app. In a browser the
// Reminders dialog is unchanged: the daily summary, and no phone-only option.
test("the Reminders dialog offers no on-device option in a browser", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("bd:ui-flags:v1", JSON.stringify({ welcomeSeen: true }));
  });
  await page.goto("/inventory");
  await page.getByRole("button", { name: /Reminders/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Reminders" });
  await expect(dialog.getByText("Daily summary notification")).toBeVisible();
  await expect(dialog.getByText("Remind me on this phone")).toHaveCount(0);
});

test("the offline page is served, and its retry goes to the site when run locally", async ({ page }) => {
  await page.goto("/offline.html");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});
