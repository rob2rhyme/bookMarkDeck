import { E2E_USER, expect, test } from "./fixtures/session";

// Firestore refuses a document over 1 MiB on the server, after the device has
// accepted it — the offline queue drops the refused write and the next snapshot
// puts the old copy back, so the edit vanished without a word. An item that big
// is now refused in the form, which stays open and says what to trim.
test("an item too large to save keeps the form open with the reason, and saves once trimmed", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("bd:ui-flags:v1", JSON.stringify({ welcomeSeen: true }));
  });
  await page.goto("/inventory");
  await page.getByRole("button", { name: /Add item/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add item" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("Archive box");
  await dialog.getByRole("button", { name: /Add details/ }).click();
  const notes = dialog.getByRole("textbox", { name: "Notes" });
  await notes.fill("x".repeat(1_100_000));
  await dialog.locator('button[type="submit"]').click();

  await expect(dialog.getByRole("alert")).toContainText(/This item is 1\.\d\d MB, and one saved record holds up to 1 MB/);
  await expect(dialog).toBeVisible();
  const key = `bookmarkdeck:inventory:items:v1:${E2E_USER.email}`;
  const saved = () =>
    page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "[]").map((i: { name: string }) => i.name), key);
  expect(await saved()).toEqual([]);

  await notes.fill("Tax years 2019–2023");
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toBeHidden();
  await expect.poll(saved).toEqual(["Archive box"]);
});
