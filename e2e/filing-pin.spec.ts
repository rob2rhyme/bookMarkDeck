import { E2E_USER, expect, test } from "./fixtures/session";

// The Filing PIN lock, end to end in a real browser: confidential (locked) papers are hidden
// from lists, search and the settings export while it is on, open again with the PIN, and
// "Lock now" puts them away. A privacy screen, not encryption — the copy says so.
const PIN = "4821";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ email }) => {
      localStorage.setItem("bd:ui-flags:v1", JSON.stringify({ welcomeSeen: true }));
      const folders = `bookmarkdeck:filing:folders:v1:${email}`;
      if (localStorage.getItem(folders)) return;
      const base = { aliases: [], tags: [], obligations: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null };
      localStorage.setItem(
        folders,
        JSON.stringify([
          { id: "f-legal", name: "Legal", homePlaceId: null, currentPlaceId: null, parentId: null, aliases: [], tags: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null },
        ])
      );
      localStorage.setItem(
        `bookmarkdeck:filing:documents:v1:${email}`,
        JSON.stringify([
          { id: "p-plain", title: "Car insurance", folderId: "f-legal", ...base },
          {
            id: "p-secret",
            title: "Divorce decree",
            folderId: "f-legal",
            confidential: true,
            lock: { kid: "v1", iv: "aXY=", ct: "Y3Q=" },
            ...base,
          },
        ])
      );
    },
    { email: E2E_USER.email }
  );
});

const search = (page: import("@playwright/test").Page) => page.getByLabel("Search your filing log");

test("a PIN hides confidential papers until it is entered, and Lock now puts them away", async ({ page }) => {
  await page.goto("/filing");

  // No PIN yet: the page offers one, and everything shows.
  await expect(page.getByRole("status").or(page.getByText(/set a PIN to hide it/))).toContainText(/1 confidential paper/);
  await search(page).fill("Divorce");
  await expect(page.getByText("Divorce decree").first()).toBeVisible();
  await search(page).fill("");

  // Turn the lock on from the header.
  await page.getByRole("button", { name: "Confidential papers lock" }).click();
  const manage = page.getByRole("dialog", { name: "Lock confidential papers" });
  await expect(manage).toContainText("not encryption");
  await manage.getByLabel("New PIN").fill(PIN);
  await manage.getByLabel("Confirm PIN").fill(PIN);
  await manage.getByRole("button", { name: "Turn on lock" }).click();
  await expect(manage).toContainText("Lock is on");
  await manage.getByRole("button", { name: "Close", exact: true }).click();

  // Reloaded, it is locked: the paper is nowhere.
  await page.reload();
  await expect(page.getByRole("status")).toContainText("1 confidential paper hidden");
  await expect(page.getByText("Divorce decree")).toHaveCount(0);
  await search(page).fill("Divorce");
  await expect(page.getByText(/Nothing matches/)).toBeVisible();
  await search(page).fill("Car");
  await expect(page.getByText("Car insurance").first()).toBeVisible();
  await search(page).fill("");

  // The folder lists only what is not confidential.
  await page.getByRole("button", { name: "Papers", exact: true }).click();
  const papers = page.getByRole("dialog");
  await expect(papers).toContainText("Car insurance");
  await expect(papers).not.toContainText("Divorce decree");
  await page.keyboard.press("Escape");

  // The settings backup will not quietly leave it out.
  await page.getByRole("button", { name: "Reminders" }).click();
  const settings = page.getByRole("dialog");
  await expect(settings.getByRole("button", { name: "Export JSON" })).toBeDisabled();
  await expect(settings).toContainText("Unlock your 1 confidential paper first");
  await page.keyboard.press("Escape");

  // A wrong PIN does not open it; the right one does.
  await page.getByRole("button", { name: "Unlock" }).click();
  const unlock = page.getByRole("dialog", { name: "Unlock confidential papers" });
  await unlock.getByLabel("PIN").fill("0000");
  await unlock.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(unlock).toContainText("didn't match");
  await unlock.getByLabel("PIN").fill(PIN);
  await unlock.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(unlock).toBeHidden();
  await expect(page.getByRole("status")).toContainText("1 confidential paper showing");

  await search(page).fill("Divorce");
  await expect(page.getByText("Divorce decree").first()).toBeVisible();
  await search(page).fill("");
  await page.getByRole("button", { name: "Papers", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Divorce decree");
  await expect(page.getByRole("img", { name: "Reference and note locked" })).toBeVisible();

  // Lock now (from the bar, under the dialog we just read): hidden again.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Lock now" }).click();
  await expect(page.getByRole("status")).toContainText("1 confidential paper hidden");
  await expect(page.getByText("Divorce decree")).toHaveCount(0);
  await search(page).fill("Divorce");
  await expect(page.getByText(/Nothing matches/)).toBeVisible();

  // The PIN is stored hashed, per account, under Filing's own key.
  const stored = await page.evaluate((email) => localStorage.getItem(`bookmarkdeck:filing:lock:v1:${email}`) ?? "", E2E_USER.email);
  expect(stored).toContain("pinHash");
  expect(stored).not.toContain(PIN);
  const inventoryKey = await page.evaluate((email) => localStorage.getItem(`bookmarkdeck:inventory:lock:v1:${email}`), E2E_USER.email);
  expect(inventoryKey).toBeNull();
});

test("forgetting the PIN is recoverable, and says what it reveals", async ({ page }) => {
  await page.goto("/filing");
  await page.getByRole("button", { name: "Confidential papers lock" }).click();
  const manage = page.getByRole("dialog", { name: "Lock confidential papers" });
  await manage.getByLabel("New PIN").fill(PIN);
  await manage.getByLabel("Confirm PIN").fill(PIN);
  await manage.getByRole("button", { name: "Turn on lock" }).click();
  await manage.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();

  await page.getByRole("button", { name: "Unlock" }).click();
  const unlock = page.getByRole("dialog", { name: "Unlock confidential papers" });
  await unlock.getByRole("button", { name: "Forgot your PIN?" }).click();
  await expect(unlock).toContainText("Nothing is deleted");
  await unlock.getByRole("button", { name: /Reset & reveal/ }).click();
  await expect(unlock).toBeHidden();
  // The lock is off: the paper shows, and the page offers a PIN again.
  await expect(page.getByText(/set a PIN to hide it/)).toBeVisible();
  await search(page).fill("Divorce");
  await expect(page.getByText("Divorce decree").first()).toBeVisible();
});
