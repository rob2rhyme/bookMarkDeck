import { test as anon, expect as anonExpect } from "@playwright/test";

import { test, expect } from "./fixtures/session";

// Saving from another app's Share sheet: the manifest names /share as the
// target, /share pre-fills what was shared, and a signed-out share survives
// sign-in instead of landing on the home page.

anon("the manifest offers /share as a share target", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  anonExpect(manifest.share_target).toEqual({
    action: "/share",
    method: "GET",
    params: { title: "title", text: "text", url: "url" },
  });
});

anon("a share while signed out keeps the link through sign-in", async ({ page }) => {
  await page.goto("/share?title=Kept&text=https%3A%2F%2Fexample.com%2Fkept");
  await anonExpect(page).toHaveURL(/\/login\?/);
  const callback = new URL(page.url()).searchParams.get("callbackUrl") ?? "";
  anonExpect(callback).toContain("/share?");
  anonExpect(decodeURIComponent(callback)).toContain("example.com/kept");
});

test.describe("signed in", () => {
  test("a shared link is saved and shows on the bookmarks page", async ({ page }) => {
    // Chrome on Android: the page title in `title`, the link inside `text`.
    await page.goto("/share?title=Shared%20page&text=https%3A%2F%2Fexample.com%2Fshared-page");
    await expect(page.getByText("https://example.com/shared-page")).toBeVisible();
    const title = page.getByRole("textbox", { name: "Title" });
    await expect(title).toHaveValue("Shared page");
    const save = page.getByRole("button", { name: "Save bookmark" });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText("Saved to Bookmark Deck.")).toBeVisible();

    await page.goto("/");
    await expect(page.getByText("Shared page").first()).toBeVisible();

    // Sharing it again says so before adding a second copy.
    await page.goto("/share?url=https%3A%2F%2Fexample.com%2Fshared-page%2F");
    await expect(page.getByText(/Already in your deck/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save again" })).toBeVisible();
  });

  test("a share without a web link says there is nothing to save", async ({ page }) => {
    await page.goto("/share?text=just%20some%20words");
    await expect(page.getByText(/didn.t include a web link/)).toBeVisible();
  });

  test("signing in from /login returns to the page that asked", async ({ page }) => {
    await page.goto(`/login?callbackUrl=${encodeURIComponent("/share?url=https://example.com/back")}`);
    await expect(page).toHaveURL(/\/share\?url=/);
    await page.goto(`/login?callbackUrl=${encodeURIComponent("https://evil.example/")}`);
    await expect(page).toHaveURL(/\/$/);
  });
});
