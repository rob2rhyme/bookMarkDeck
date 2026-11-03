import { test, expect } from "./fixtures/session";

// Add Link without a title: the bookmark is saved at once under its URL, then
// takes the page's title from /api/link-title (mocked here — the test server
// must not fetch the internet). A title you typed is never replaced or fetched.

test("an untitled link takes its page's title", async ({ page }) => {
  const asked: string[] = [];
  await page.route("**/api/link-title?**", async (route) => {
    asked.push(new URL(route.request().url()).searchParams.get("url") ?? "");
    await route.fulfill({ json: { title: "Example Domain" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Add Link/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add link" });
  await dialog.getByPlaceholder("https://example.com").fill("https://example.com/untitled");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText("Example Domain").first()).toBeVisible();
  expect(asked).toEqual(["https://example.com/untitled"]);
});

test("a typed title is kept, and nothing is fetched", async ({ page }) => {
  let asked = 0;
  await page.route("**/api/link-title?**", async (route) => {
    asked++;
    await route.fulfill({ json: { title: "Should not appear" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Add Link/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add link" });
  await dialog.getByPlaceholder(/^Title/).fill("My own name");
  await dialog.getByPlaceholder("https://example.com").fill("https://example.com/named");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText("My own name").first()).toBeVisible();
  await expect(page.getByText("Should not appear")).toHaveCount(0);
  expect(asked).toBe(0);
});
