import { E2E_USER, expect, test } from "./fixtures/session";

// The read-later queue end to end: derived from timestamps on the bookmarks, oldest
// first, fed from the card, the Add Link form, the share sheet and the reader.
const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString();

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ email, old, recent }) => {
      localStorage.setItem("bd:ui-flags:v1", JSON.stringify({ welcomeSeen: true }));
      if (localStorage.getItem(`bookmarkdeck:v2:${email}`)) return;
      const mk = (id: string, title: string, extra: object = {}) => ({
        id,
        title,
        url: `https://${id}.example.com/post`,
        createdAt: "2026-01-01T00:00:00.000Z",
        tags: [],
        pinned: false,
        folderId: null,
        ...extra,
      });
      localStorage.setItem(
        `bookmarkdeck:v2:${email}`,
        JSON.stringify({
          version: 2,
          bookmarks: [
            mk("newer", "Newer article", { readLaterAt: recent }),
            mk("older", "Older article", { readLaterAt: old }),
            mk("plain", "Plain bookmark"),
          ],
          folders: [],
        })
      );
    },
    { email: E2E_USER.email, old: day(20), recent: day(1) }
  );
  await page.route("**/api/reader?**", (route) => route.fulfill({ json: { article: null } }));
});

test("the queue lists what's waiting, oldest first, and Done takes one out", async ({ page }) => {
  await page.goto("/");
  const queue = page.getByRole("region", { name: "Read later" });
  await expect(queue).toContainText("Read later · 2");
  const rows = queue.getByRole("listitem");
  await expect(rows.nth(0)).toContainText("Older article");
  await expect(rows.nth(0)).toContainText("waiting 2 weeks");
  await expect(rows.nth(1)).toContainText("Newer article");

  await queue.getByRole("button", { name: "Mark Older article as read" }).click();
  await expect(queue).toContainText("Read later · 1");
  await expect(queue).not.toContainText("Older article");

  await page.reload();
  await expect(page.getByRole("region", { name: "Read later" })).toContainText("Read later · 1");
});

test("Add Link can queue the new bookmark", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Add Link/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add link" });
  await dialog.getByPlaceholder(/^Title/).fill("Saved for tonight");
  await dialog.getByPlaceholder("https://example.com").fill("https://tonight.example.com/read");
  await dialog.getByLabel("Add to read later").check();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "Read later" })).toContainText("Read later · 3");
  await expect(page.getByRole("region", { name: "Read later" })).toContainText("Saved for tonight");
});

test("a shared link is queued by default, and can be unticked", async ({ page }) => {
  await page.goto("/share?title=Shared%20piece&text=https%3A%2F%2Fshared.example.com%2Fpiece");
  const box = page.getByLabel("Add to read later");
  await expect(box).toBeChecked();
  await page.getByRole("button", { name: "Save bookmark" }).click();
  await expect(page.getByText("Saved to Bookmark Deck.")).toBeVisible();
  await expect(page.getByText("It's in your read-later queue.")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Read later" })).toContainText("Shared piece");

  await page.goto("/share?title=Another&text=https%3A%2F%2Fanother.example.com%2Fa");
  await page.getByLabel("Add to read later").uncheck();
  await page.getByRole("button", { name: "Save bookmark" }).click();
  await expect(page.getByText("Saved to Bookmark Deck.")).toBeVisible();
  await expect(page.getByText("It's in your read-later queue.")).toHaveCount(0);
});

test("reading from the queue, then marking it read inside the reader", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Read Older article" }).click();
  const dialog = page.getByRole("dialog", { name: "Older article" });
  await expect(dialog).toContainText("In your queue");
  await dialog.getByRole("button", { name: "Mark read" }).click();
  await expect(dialog).toContainText("Read");
  await expect(dialog.getByRole("button", { name: "Queue again" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("region", { name: "Read later" })).toContainText("Read later · 1");
});

test("a bookmark card has a Read later row too", async ({ page }) => {
  await page.goto("/folders/unstaged");
  // The card renders a mobile and a desktop layout; only the visible one counts.
  await expect(page.getByText("Plain bookmark").locator("visible=true").first()).toBeVisible();
  await page.getByRole("button", { name: /Read later/ }).first().click();
  await expect(page.getByText(/In your queue/).locator("visible=true").first()).toBeVisible();
});
