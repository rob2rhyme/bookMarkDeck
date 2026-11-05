import { E2E_USER, expect, test } from "./fixtures/session";

// "Bookmark Deck is not a password manager", enforced where people type: a note or a
// paper's reference that looks like a password, PIN, card or ID number is refused with
// the reason, and nothing is saved. Ordinary references and notes go through.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ email }) => {
      localStorage.setItem("bd:ui-flags:v1", JSON.stringify({ welcomeSeen: true }));
      if (localStorage.getItem(`bookmarkdeck:v2:${email}`)) return;
      localStorage.setItem(
        `bookmarkdeck:v2:${email}`,
        JSON.stringify({
          version: 2,
          bookmarks: [
            {
              id: "bank",
              title: "Example Bank",
              url: "https://bank.example.com",
              createdAt: "2026-01-01T00:00:00.000Z",
              tags: [],
              pinned: false,
              folderId: null,
              note: "old note kept as is",
            },
          ],
          folders: [],
        })
      );
    },
    { email: E2E_USER.email }
  );
});

test("a bookmark note that looks like a password is refused, and a clean one saves", async ({ page }) => {
  await page.goto("/folders/unstaged");
  await page.getByRole("button", { name: /^Edit/ }).first().click();
  const note = page.getByPlaceholder("Add purpose, which account to use, etc.").locator("visible=true").first();
  await note.fill("login: sam\npassword: s3cret!");

  const alert = page.getByRole("alert").filter({ hasText: "not a password manager" }).locator("visible=true").first();
  await expect(alert).toContainText("looks like a password");

  // Save is refused: the card stays in edit mode and the stored note is unchanged.
  await page.getByRole("button", { name: /^Save/ }).locator("visible=true").first().click();
  await expect(note).toBeVisible();
  const stored = await page.evaluate(
    (email) => JSON.parse(localStorage.getItem(`bookmarkdeck:v2:${email}`)!).bookmarks[0].note,
    E2E_USER.email
  );
  expect(stored).toBe("old note kept as is");

  // Say where it lives instead, and it saves.
  await note.fill("Work Google account; password is in Bitwarden");
  await expect(page.getByRole("alert").filter({ hasText: "not a password manager" })).toHaveCount(0);
  await page.getByRole("button", { name: /^Save/ }).locator("visible=true").first().click();
  await expect
    .poll(() =>
      page.evaluate(
        (email) => JSON.parse(localStorage.getItem(`bookmarkdeck:v2:${email}`)!).bookmarks[0].note,
        E2E_USER.email
      )
    )
    .toBe("Work Google account; password is in Bitwarden");
});

test("a paper's reference refuses a card number but takes a policy number", async ({ page }) => {
  await page.goto("/filing");
  await page.getByRole("button", { name: /File a paper/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "File a paper" });
  await dialog.getByLabel("Title").fill("Car insurance");
  await dialog.getByText("Add details", { exact: false }).click();

  await dialog.getByRole("textbox", { name: "Reference", exact: true }).fill("4111 1111 1111 1111");
  await expect(dialog.getByRole("alert")).toContainText("looks like a card number");
  await expect(dialog.locator('button[type="submit"]')).toBeDisabled();

  await dialog.getByRole("textbox", { name: "Reference", exact: true }).fill("Policy 4829104772");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.locator('button[type="submit"]')).toBeEnabled();
});
