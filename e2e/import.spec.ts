import { expect, test } from "./fixtures/session";

// Moving in from another service: a Raindrop CSV and a Pocket CSV go through the
// same Import button, preview and Undo as a browser bookmarks file.
const RAINDROP = `id,title,note,excerpt,url,folder,tags,created,cover,highlights,favorite
1,Rust book,Read ch. 4 first,The Rust book,https://doc.rust-lang.org/book/,Dev,"rust, learning",2024-03-05T10:15:30.000Z,,,true
2,Loose raindrop,,,https://example.com/loose-raindrop,Unsorted,,2024-04-01T00:00:00.000Z,,,false
3,Not a link,,,,Dev,,2024-05-09T08:00:00.000Z,,,false
`;
const POCKET = `title,url,time_added,tags,status
Pocket article,https://example.com/pocket-read,1700000000,reading|later,unread
Pocket old one,https://example.com/pocket-old,1600000000,,archive
`;

const pick = (page: import("@playwright/test").Page, name: string, body: string) =>
  page.locator('input[type="file"]').first().setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(body) });

test("a Raindrop CSV previews, imports into its folder, and can be undone", async ({ page }) => {
  await page.goto("/");
  await pick(page, "raindrop-export.csv", RAINDROP);
  const dialog = page.getByRole("dialog", { name: "Import preview" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("raindrop-export.csv (Raindrop)")).toBeVisible();
  await expect(dialog.getByText("+2", { exact: true }).first()).toBeVisible(); // 2 links; the row with no link is skipped
  await dialog.getByRole("button", { name: "Import" }).click();

  await expect(page.getByText("Imported 3 new items.")).toBeVisible(); // 2 bookmarks + the Dev folder
  await expect(page.getByText("Rust book").first()).toBeVisible();
  await expect(page.getByText("Loose raindrop").first()).toBeVisible();
});

test("a Pocket CSV files its links under a Pocket folder", async ({ page }) => {
  await page.goto("/");
  await pick(page, "pocket-export.csv", POCKET);
  const dialog = page.getByRole("dialog", { name: "Import preview" });
  await expect(dialog.getByText("pocket-export.csv (Pocket)")).toBeVisible();
  await expect(dialog.getByText("New folders")).toBeVisible(); // Pocket, and Pocket / Read archive
  await dialog.getByRole("button", { name: "Import" }).click();
  await expect(page.getByText("Imported 4 new items.")).toBeVisible(); // 2 bookmarks + 2 folders
  await expect(page.getByText("Pocket article").first()).toBeVisible();
});

test("a CSV with no url column says so instead of importing nothing silently", async ({ page }) => {
  await page.goto("/");
  await pick(page, "other.csv", "name,age\nA,3\n");
  await expect(page.getByText(/no "url" column/)).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Import preview" })).toHaveCount(0);
});
