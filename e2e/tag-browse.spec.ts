import { E2E_USER, expect, test } from "./fixtures/session";

// Browse by tag: a chip row with counts narrows the whole home page to one tag.
test.beforeEach(async ({ page }) => {
  await page.addInitScript((email) => {
    localStorage.setItem("bd:ui-flags:v1", JSON.stringify({ welcomeSeen: true }));
    if (localStorage.getItem(`bookmarkdeck:v2:${email}`)) return;
    const mk = (id: string, title: string, tags: string[]) => ({
      id,
      title,
      url: `https://${id}.example.com`,
      createdAt: "2026-01-01T00:00:00.000Z",
      tags,
      pinned: false,
      folderId: null,
    });
    localStorage.setItem(
      `bookmarkdeck:v2:${email}`,
      JSON.stringify({
        version: 2,
        bookmarks: [
          mk("a", "Alpha bank", ["Banking", "money"]),
          mk("b", "Beta tools", ["dev"]),
          mk("c", "Gamma wiki", ["dev", "reading"]),
        ],
        folders: [],
      })
    );
  }, E2E_USER.email);
});

test("tag chips show counts and narrow the page to one tag", async ({ page }) => {
  await page.goto("/");
  const tags = page.getByRole("group", { name: "Browse by tag" });
  await expect(tags.getByRole("button", { name: "dev 2" })).toBeVisible();
  await expect(tags.getByRole("button", { name: "Banking 1" })).toBeVisible();
  await expect(page.getByText("Alpha bank").first()).toBeVisible();

  await tags.getByRole("button", { name: "dev 2" }).click();
  await expect(tags.getByRole("button", { name: "dev 2" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Beta tools").first()).toBeVisible();
  await expect(page.getByText("Gamma wiki").first()).toBeVisible();
  await expect(page.getByText("Alpha bank")).toHaveCount(0);

  // The chip toggles off, and "Clear search & filters" clears it too.
  await tags.getByRole("button", { name: "dev 2" }).click();
  await expect(page.getByText("Alpha bank").first()).toBeVisible();
  await tags.getByRole("button", { name: "Banking 1" }).click();
  await expect(page.getByText("Beta tools")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search & filters" }).click();
  await expect(page.getByText("Beta tools").first()).toBeVisible();
});
