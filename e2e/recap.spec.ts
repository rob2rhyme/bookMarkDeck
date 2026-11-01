import { E2E_USER, expect, test } from "./fixtures/session";

// The home page's "Your week" card counts what the pillars already keep on the
// device. Seeded here with one habit check-in today.
test("the weekly recap shows this week's activity and hides until next week", async ({ page }) => {
  await page.addInitScript((email) => {
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const key = `bookmarkdeck:habit-entries:v1:${email}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(
        key,
        JSON.stringify([{ id: `h1_${day}`, habitId: "h1", day, status: "done", count: 1, createdAt: d.toISOString() }])
      );
    }
  }, E2E_USER.email);

  await page.goto("/");
  const card = page.getByRole("region", { name: "Your week" });
  await expect(card).toBeVisible();
  const row = card.getByRole("row", { name: /Habit check-ins/ });
  await expect(row.getByRole("cell")).toHaveText(["1", "0"]);

  await card.getByRole("button", { name: "Hide until next week" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("region", { name: "Your week" })).toHaveCount(0);
});

test("the recap stays away when there is nothing to show", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Your week" })).toHaveCount(0);
});
