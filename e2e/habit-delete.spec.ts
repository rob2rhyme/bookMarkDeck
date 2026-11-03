import { expect, test } from "./fixtures/session";

// Deleting a habit is asked in the page's own dialog, not the browser's
// `window.confirm` — which would never be seen by this test (Playwright
// auto-dismisses native dialogs, so a regression to it would delete nothing here).
async function addHabit(page: import("@playwright/test").Page, name: string) {
  await page.goto("/habits");
  await page.getByRole("button", { name: /new habit/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("e.g. Meditate").fill(name);
  await dialog.getByRole("button", { name: "Add habit" }).click();
  await expect(page.getByText(name).first()).toBeVisible();
}

test("cancelling the delete dialog keeps the habit; confirming removes it", async ({ page }) => {
  let native = 0;
  page.on("dialog", (d) => {
    native++;
    void d.dismiss();
  });
  await addHabit(page, "Stretch");

  await page.getByRole("button", { name: "Options for Stretch" }).last().click();
  await page.getByRole("button", { name: "Delete", exact: true }).first().click();
  const confirm = page.getByRole("dialog", { name: "Delete “Stretch”?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText("Stretch").first()).toBeVisible();

  await page.getByRole("button", { name: "Options for Stretch" }).last().click();
  await page.getByRole("button", { name: "Delete", exact: true }).first().click();
  await page.getByRole("dialog", { name: "Delete “Stretch”?" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Stretch")).toHaveCount(0);
  expect(native).toBe(0);
});
