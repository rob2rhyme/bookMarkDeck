import { E2E_USER, expect, test } from "./fixtures/session";

// A milestone crossed after this device last looked gets one quiet card; the
// first look at an account celebrates nothing, however much it has earned.
const seed = ({ email, count, seen }: { email: string; count: number; seen: string[] | null }) => {
  localStorage.setItem("bd:ui-flags:v1", JSON.stringify({ welcomeSeen: true }));
  if (localStorage.getItem(`bookmarkdeck:v2:${email}`)) return; // keep it across reloads
  const bookmarks = Array.from({ length: count }, (_, i) => ({
    id: `b${i}`,
    title: `Site ${i}`,
    url: `https://site${i}.example.com`,
    createdAt: "2026-01-01T00:00:00.000Z",
    tags: [],
    pinned: false,
    folderId: null,
  }));
  localStorage.setItem(`bookmarkdeck:v2:${email}`, JSON.stringify({ version: 2, bookmarks, folders: [] }));
  if (seen) localStorage.setItem(`bd:milestones:seen:v1:${email}`, JSON.stringify(seen));
};

test("a first visit with 60 bookmarks shows the badge but no celebration", async ({ page }) => {
  await page.addInitScript(seed, { email: E2E_USER.email, count: 60, seen: null });
  await page.goto("/");
  await expect(page.getByLabel("Milestones earned").getByText("50 bookmarks saved")).toBeVisible();
  await page.waitForTimeout(3500); // past the settle delay
  await expect(page.getByRole("status").filter({ hasText: "New milestone" })).toHaveCount(0);
});

test("crossing 50 bookmarks celebrates once", async ({ page }) => {
  await page.addInitScript(seed, { email: E2E_USER.email, count: 49, seen: ["bookmarks-25"] });
  await page.goto("/");
  await expect(page.getByLabel("Milestones earned").getByText("25 bookmarks saved")).toBeVisible();

  await page.getByRole("button", { name: /Add Link/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add link" });
  await dialog.getByPlaceholder(/^Title/).fill("The fiftieth");
  await dialog.getByPlaceholder("https://example.com").fill("https://fiftieth.example.com");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  const card = page.getByRole("status").filter({ hasText: "New milestone" });
  await expect(card).toContainText("50 bookmarks saved", { timeout: 8000 });
  await card.getByRole("button", { name: "Nice" }).click();
  await expect(card).toHaveCount(0);

  await page.reload();
  await page.waitForTimeout(3500);
  await expect(page.getByRole("status").filter({ hasText: "New milestone" })).toHaveCount(0);
  await expect(page.getByLabel("Milestones earned").getByText("50 bookmarks saved")).toBeVisible();
});
