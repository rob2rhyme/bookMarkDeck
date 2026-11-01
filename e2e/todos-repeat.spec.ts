import { expect, test } from "./fixtures/session";

// Completing a repeating to-do files the next one; Undo takes it back. Driven
// through the real form so the repeat control, the badge and the hook agree.
test("a repeating to-do comes back when completed, and Undo withdraws it", async ({ page }) => {
  await page.goto("/focus");
  const list = page.locator("#sec-todos");

  await list.getByLabel("Add a to-do").fill("Water the plants");
  await list.getByRole("button", { name: "Set due date" }).click();
  await list.getByRole("button", { name: "Tomorrow" }).click();
  await list.getByRole("button", { name: "⚑ High" }).click();
  await list.getByLabel("Repeat").selectOption("weekly");
  await list.getByRole("button", { name: "Add", exact: true }).click();

  const rows = list.getByRole("listitem").filter({ hasText: "Water the plants" });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("↻ Weekly");
  await expect(rows.first()).toContainText("⚑ High");

  await rows.first().getByRole("button", { name: "Mark done" }).click();
  // The finished one moves to Done; a fresh one is open, still repeating.
  await expect(rows.filter({ hasText: "↻ Weekly" })).toHaveCount(1);
  await expect(rows.filter({ has: page.getByRole("button", { name: "Mark done" }) })).toHaveCount(1);

  await page.getByRole("button", { name: "Undo" }).first().click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("↻ Weekly");
  await expect(rows.first().getByRole("button", { name: "Mark done" })).toBeVisible();
});
