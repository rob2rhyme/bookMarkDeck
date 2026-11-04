import { E2E_USER, expect, test } from "./fixtures/session";

// Reader view and highlights, end to end: the page's text is fetched from
// /api/reader (mocked — the test server must not reach the internet), a passage
// is selected and highlighted, and the highlight survives a reload because it is
// kept on the bookmark.
const PARA = "Reading calmly is easier when the page around the words gets out of the way.";

test.beforeEach(async ({ page }) => {
  await page.addInitScript((email) => {
    localStorage.setItem("bd:ui-flags:v1", JSON.stringify({ welcomeSeen: true }));
    if (localStorage.getItem(`bookmarkdeck:v2:${email}`)) return;
    localStorage.setItem(
      `bookmarkdeck:v2:${email}`,
      JSON.stringify({
        version: 2,
        bookmarks: [
          {
            id: "r1",
            title: "A long read",
            url: "https://example.com/long-read",
            createdAt: "2026-01-01T00:00:00.000Z",
            tags: [],
            pinned: false,
            folderId: null,
          },
        ],
        folders: [],
      })
    );
  }, E2E_USER.email);
  await page.route("**/api/reader?**", (route) =>
    route.fulfill({
      json: {
        article: {
          title: "A long read",
          byline: "Ada Lovelace",
          truncated: false,
          blocks: [
            { type: "h", level: 2, text: "Why bother" },
            { type: "p", text: PARA },
            { type: "li", text: "Fewer distractions" },
            { type: "li", text: "More of the actual text" },
            { type: "p", text: "A second paragraph that has plenty of words in it to be a paragraph." },
          ],
        },
      },
    })
  );
});

test("read a saved page, highlight a passage, and it stays highlighted", async ({ page }) => {
  await page.goto("/folders/unstaged");
  await page.getByRole("button", { name: "Read", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "A long read" });
  await expect(dialog.getByText("Ada Lovelace")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Why bother" })).toBeVisible();
  await expect(dialog.getByText("Fewer distractions")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Open original" })).toHaveAttribute("href", "https://example.com/long-read");

  // Select "the page around the words" inside the first paragraph.
  await page.evaluate((phrase) => {
    const p = [...document.querySelectorAll("p")].find((el) => el.textContent?.includes(phrase))!;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text;
    while (node && !node.data.includes(phrase)) node = walker.nextNode() as Text;
    const start = node.data.indexOf(phrase);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + phrase.length);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }, "the page around the words");
  await expect(dialog.getByText("“the page around the words”")).toBeVisible();
  await dialog.getByRole("button", { name: "Highlight", exact: true }).click();

  await expect(dialog.locator("mark")).toHaveText("the page around the words");
  await expect(dialog.getByRole("region", { name: "Highlights" })).toContainText("the page around the words");

  // Kept on the bookmark itself.
  const stored = await page.evaluate((email) => JSON.parse(localStorage.getItem(`bookmarkdeck:v2:${email}`)!), E2E_USER.email);
  expect(stored.bookmarks[0].highlights.map((h: { text: string }) => h.text)).toEqual(["the page around the words"]);

  // ...and is marked again after a reload.
  await page.reload();
  await page.getByRole("button", { name: /^Read \(1 highlighted\)/ }).click();
  await expect(page.getByRole("dialog", { name: "A long read" }).locator("mark")).toHaveText("the page around the words");

  // Removing it unmarks the text and clears it from the bookmark.
  await page.getByRole("button", { name: /^Remove highlight/ }).click();
  await expect(page.getByRole("dialog", { name: "A long read" }).locator("mark")).toHaveCount(0);
  const after = await page.evaluate((email) => JSON.parse(localStorage.getItem(`bookmarkdeck:v2:${email}`)!), E2E_USER.email);
  expect(after.bookmarks[0].highlights).toBeUndefined();
});

test("a page that can't be read says so and points to the original", async ({ page }) => {
  await page.route("**/api/reader?**", (route) => route.fulfill({ json: { article: null } }));
  await page.goto("/folders/unstaged");
  await page.getByRole("button", { name: "Read", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "A long read" });
  await expect(dialog.getByText(/can’t be shown in reader view/)).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Open original" })).toBeVisible();
});
