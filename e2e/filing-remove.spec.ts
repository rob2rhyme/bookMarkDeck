import { E2E_USER, expect, test } from "./fixtures/session";

// Removing a paper is one tap, and it now takes the paper's scans with it — which can't
// be brought back. So nothing is deleted until the Undo window closes: the paper is only
// hidden, Undo puts it back, and only then is the paper (and its scans) removed.
const DOCS = `bookmarkdeck:filing:documents:v1:${E2E_USER.email}`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ email, docsKey }) => {
      localStorage.setItem("bd:ui-flags:v1", JSON.stringify({ welcomeSeen: true }));
      const folders = `bookmarkdeck:filing:folders:v1:${email}`;
      if (localStorage.getItem(folders)) return;
      const base = { aliases: [], tags: [], obligations: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null };
      localStorage.setItem(
        folders,
        JSON.stringify([
          { id: "f-home", name: "Home", homePlaceId: null, currentPlaceId: null, parentId: null, aliases: [], tags: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null },
        ])
      );
      localStorage.setItem(
        docsKey,
        JSON.stringify([
          { id: "p-deed", title: "House deed", folderId: "f-home", hasAttachment: true, ...base },
          { id: "p-boiler", title: "Boiler warranty", folderId: "f-home", ...base },
        ])
      );
    },
    { email: E2E_USER.email, docsKey: DOCS }
  );
});

const stored = (page: import("@playwright/test").Page) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "[]").map((d: { id: string }) => d.id).sort(), DOCS);

test("a removed paper waits out its Undo window before anything is deleted", async ({ page }) => {
  await page.goto("/filing");
  await page.getByRole("button", { name: "Papers", exact: true }).click();
  const papers = page.getByRole("dialog");

  await papers.getByRole("button", { name: "Remove House deed" }).click();
  await expect(papers).not.toContainText("House deed");
  const toast = page.getByText("Removed “House deed” and its scans.");
  await expect(toast).toBeVisible();
  // Hidden, not deleted: the device still holds it.
  expect(await stored(page)).toEqual(["p-boiler", "p-deed"]);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(papers).toContainText("House deed");

  await papers.getByRole("button", { name: "Remove House deed" }).click();
  await expect(papers).not.toContainText("House deed");
  await expect.poll(() => stored(page), { timeout: 10_000 }).toEqual(["p-boiler"]);
  await expect(papers).toContainText("Boiler warranty");
});
