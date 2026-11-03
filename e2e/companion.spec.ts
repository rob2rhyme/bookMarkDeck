import { E2E_USER, expect, test } from "./fixtures/session";

// The habit companion on the real page: it appears once you have habits, grows
// with the check-ins you've logged, says so kindly, and can be renamed or hidden.
const seed = ({ email }: { email: string }) => {
  localStorage.setItem("bd:ui-flags:v1", JSON.stringify({ welcomeSeen: true, habitsOnboarded: true }));
  if (localStorage.getItem(`bookmarkdeck:habits:v1:${email}`)) return;
  const d = new Date();
  const day = (back: number) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };
  localStorage.setItem(
    `bookmarkdeck:habits:v1:${email}`,
    JSON.stringify([
      { id: "h1", name: "Stretch", type: "binary", direction: "build", schedule: { type: "daily" }, hue: 200, emoji: "🧘", sortOrder: 0, createdAt: "2026-01-01T00:00:00.000Z", archived: false },
    ])
  );
  // Eight done check-ins on earlier days: a Seedling (7–29), nothing done today yet.
  localStorage.setItem(
    `bookmarkdeck:habit-entries:v1:${email}`,
    JSON.stringify(
      Array.from({ length: 8 }, (_, i) => ({ id: `h1_${day(i + 1)}`, habitId: "h1", day: day(i + 1), status: "done", count: 1, createdAt: d.toISOString() }))
    )
  );
};

test("the companion reflects your check-ins, can be renamed, hidden and shown", async ({ page }) => {
  await page.addInitScript(seed, { email: E2E_USER.email });
  await page.goto("/habits");

  const card = page.getByRole("region", { name: "Your companion" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Seedling");
  await expect(card).toContainText("22 more check-ins to Young plant");
  await expect(card.getByRole("img")).toHaveAttribute("aria-label", /Sprout, Seedling, waiting for you/);

  // Checking the habit off today makes it glad (and one check-in closer to growing).
  await page.getByRole("button", { name: /Log Stretch done for today/ }).first().click();
  await expect(card).toContainText("21 more check-ins to Young plant");
  await expect(card.getByRole("img")).toHaveAttribute("aria-label", /radiant/);

  await card.getByRole("button", { name: "Rename" }).click();
  await card.getByLabel("Companion name").fill("Moss");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByRole("heading", { name: "Moss" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Moss" })).toBeVisible();

  await page.getByRole("button", { name: "Hide" }).click();
  await expect(page.getByRole("region", { name: "Your companion" })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Show Moss" }).click();
  await expect(page.getByRole("region", { name: "Your companion" })).toBeVisible();
});
