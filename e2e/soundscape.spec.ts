import { expect, test } from "./fixtures/session";

// The soundscape is chosen under the timer, its volume appears once one is
// picked, and the choice survives a reload (it is a saved setting). The audio
// itself can't be heard from a test; the engine has its own unit tests.
test("pick a focus soundscape, set its volume, keep it across a reload", async ({ page }) => {
  await page.goto("/focus");
  const pick = page.getByLabel("Focus soundscape");
  await expect(pick).toHaveValue("off");
  await expect(page.getByLabel("Soundscape volume")).toHaveCount(0);

  // The page paints before its saved settings load, and a pick made in that gap is
  // overwritten by them — so retry until the choice sticks, as a user's would.
  await expect(async () => {
    await pick.selectOption("rain");
    await expect(page.getByLabel("Soundscape volume")).toBeVisible({ timeout: 1000 });
  }).toPass();

  // Starting the timer must not throw with a soundscape chosen (audio is
  // unlocked by the click; headless Chromium has a working AudioContext).
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "Start" }).first().click();
  await page.getByRole("button", { name: "Pause" }).first().click();
  expect(errors).toEqual([]);

  await page.reload();
  await expect(page.getByLabel("Focus soundscape")).toHaveValue("rain");
});
