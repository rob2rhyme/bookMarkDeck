import { expect, test } from "./fixtures/session";

// A habit can remind at several times a day. Driven through the real editor so
// the extra-time controls, the saved fields and the card label agree.
test("a habit with two reminder times shows both, and survives a reload", async ({ page }) => {
  await page.goto("/habits");
  await page.getByRole("button", { name: /new habit/i }).first().click();

  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("e.g. Meditate").fill("Stretch");
  await dialog.getByText("Add details", { exact: true }).click();

  await dialog.getByLabel("Reminder time", { exact: true }).fill("20:00");
  await dialog.getByRole("button", { name: "+ Add another time" }).click();
  await dialog.getByLabel("Reminder time 2", { exact: true }).fill("08:00");
  await dialog.getByRole("button", { name: "Add habit" }).click();

  // Earliest first, whichever order they were typed in.
  await expect(page.getByText("🔔 08:00, 20:00").first()).toBeVisible();

  await page.reload();
  await expect(page.getByText("🔔 08:00, 20:00").first()).toBeVisible();
});
