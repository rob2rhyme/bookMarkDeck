import { E2E_USER, expect, test } from "./fixtures/session";

// Every dialog is the shared Modal now. What the hand-built ones lacked is pinned
// here in a real browser: a focus trap, Escape, focus returned to the opener, page
// scroll locked, a backdrop that closes only on a press, and Escape closing only the
// top one when a dialog is opened from another.
test.beforeEach(async ({ page }) => {
  await page.addInitScript((email) => {
    localStorage.setItem("bd:ui-flags:v1", JSON.stringify({ welcomeSeen: true }));
    if (localStorage.getItem(`bookmarkdeck:v2:${email}`)) return;
    localStorage.setItem(
      `bookmarkdeck:v2:${email}`,
      JSON.stringify({
        version: 2,
        bookmarks: [{ id: "k1", title: "Keep me", url: "https://keep.example.com", createdAt: "2026-01-01T00:00:00.000Z", tags: [], pinned: false, folderId: null }],
        folders: [],
      })
    );
  }, E2E_USER.email);
});

const openAddLink = async (page: import("@playwright/test").Page) => {
  const opener = page.getByRole("button", { name: /Add Link/ }).first();
  await opener.click();
  return { opener, dialog: page.getByRole("dialog", { name: "Add link" }) };
};

test("Add link: focus is trapped, Escape closes, focus returns, the page doesn't scroll behind", async ({ page }) => {
  await page.goto("/");
  const { opener, dialog } = await openAddLink(page);
  await expect(dialog).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("position", "fixed");

  // Tab around well past the number of controls: focus never leaves the dialog.
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
    expect(inside, `focus escaped on Tab ${i + 1}`).toBe(true);
  }
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.locator("body")).not.toHaveCSS("position", "fixed");
});

test("a press on the backdrop closes it; a text selection that ends there doesn't", async ({ page }) => {
  await page.goto("/");
  const { dialog } = await openAddLink(page);
  const title = dialog.getByPlaceholder(/^Title/);
  await title.fill("some words to select");
  const box = (await title.boundingBox())!;

  // Press inside the field, drag out onto the backdrop, release: the old overlay (onClick) closed here.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(8, 8, { steps: 6 });
  await page.mouse.up();
  await expect(dialog).toBeVisible();

  // A press that starts on the backdrop closes it.
  await page.mouse.click(8, 8);
  await expect(dialog).toHaveCount(0);
});

test("a dialog opened from another: the new field takes focus, and Escape closes only the top one", async ({ page }) => {
  await page.goto("/");
  const { dialog } = await openAddLink(page);
  await dialog.getByRole("combobox").first().selectOption("__new__");

  const newFolder = page.getByRole("dialog", { name: "New folder" });
  await expect(newFolder).toBeVisible();
  await expect(newFolder.getByRole("textbox")).toBeFocused(); // its autoFocus wins over "first button"

  await page.keyboard.press("Escape");
  await expect(newFolder).toHaveCount(0);
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("Delete all bookmarks is a real dialog now (it had no role), and Escape cancels it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Delete All Bookmarks" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete all bookmarks" });
  await expect(confirm).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(page.getByText("Keep me").first()).toBeVisible();
});

test("the folder manager's Create folder dialog closes on Escape and returns focus", async ({ page }) => {
  await page.goto("/folders/manage");
  const opener = page.getByRole("button", { name: "Create folder" }).first();
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Create folder" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("Focus settings: Escape closes it and focus returns to the gear", async ({ page }) => {
  await page.goto("/focus");
  const gear = page.getByRole("button", { name: "Focus settings" });
  await gear.click();
  const dialog = page.getByRole("dialog", { name: "Focus settings" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(gear).toBeFocused();
});

test("Add link at desktop width: the Tags field keeps room to type (the read-later checkbox once squeezed it to a sliver)", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto("/");
  const { dialog } = await openAddLink(page);
  const tags = dialog.getByPlaceholder(/^Tags/);
  const box = (await tags.boundingBox())!;
  expect(box.width).toBeGreaterThan(150);
});

