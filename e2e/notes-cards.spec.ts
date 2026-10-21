import { E2E_USER, expect, test } from "./fixtures/session";

// The notes list is one flowing grid, and a note's first tag is a ribbon in the
// card's top-right corner that filters the list when picked.
const NOW = Date.now();
const note = (id: string, title: string, body: string, tags: string[], pinned = false) => ({
  id,
  title,
  body,
  tags,
  pinned,
  createdAt: new Date(NOW - 3_600_000).toISOString(),
  updatedAt: new Date(NOW - 3_600_000).toISOString(),
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ([email, notes]) => {
      const key = `bookmarkdeck:notes:v1:${email}`;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(notes));
    },
    [
      E2E_USER.email,
      [
        note("n1", "Pasted", "Down to 64/58 °C from 74/69 when you started, with the fan only at 3434 rpm", ["perf", "laptop"], true),
        note("n2", "Syncs", "All three took. The 1 at the end confirms turbo is now off", ["perf"]),
        note("n3", "Groceries", "milk, eggs, bread", ["home", "list", "weekly", "extra"]),
        note("n4", "Plain", "No tags on this one", []),
      ],
    ] as const
  );
});

test("pinned and other notes share one grid, side by side on a wide screen", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/notes");
  const cards = page.getByRole("listitem").filter({ has: page.getByRole("link") });
  await expect(cards).toHaveCount(4);
  const box = async (i: number) => (await cards.nth(i).boundingBox())!;
  const [a, b, c] = [await box(0), await box(1), await box(2)];
  // Pinned first, then the rest — and the first three share a row.
  await expect(cards.first()).toContainText("Pasted");
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  expect(Math.abs(b.y - c.y)).toBeLessThan(2);
  expect(b.x).toBeGreaterThan(a.x + a.width - 1);
});

test("a card's first tag is a ribbon in its top-right corner", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/notes");
  const card = page.getByRole("listitem").filter({ hasText: "Groceries" });
  const ribbon = card.getByRole("button", { name: "Show notes tagged home" });
  await expect(ribbon).toHaveText("#home");
  const [c, r] = [(await card.boundingBox())!, (await ribbon.boundingBox())!];
  // Flush with the top-right corner, inside the card's 1px border.
  expect(Math.abs(r.x + r.width - (c.x + c.width))).toBeLessThanOrEqual(2);
  expect(Math.abs(r.y - c.y)).toBeLessThanOrEqual(2);
  // The other tags are chips (two shown, the rest counted); an untagged card has no ribbon.
  await expect(card.getByRole("button", { name: "Show notes tagged list" })).toBeVisible();
  await expect(card.getByText("+1")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Plain" }).getByRole("button", { name: /Show notes tagged/ })).toHaveCount(0);
});

test("picking the ribbon filters to that tag, and picking it again clears it", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/notes");
  const ribbon = page.getByRole("listitem").filter({ hasText: "Syncs" }).getByRole("button", { name: "Show notes tagged perf" });
  await ribbon.click();
  await expect(page).toHaveURL(/tag=perf/);
  await expect(page.getByRole("listitem").filter({ has: page.getByRole("link") })).toHaveCount(2);
  await expect(ribbon).toHaveAttribute("aria-pressed", "true");
  await ribbon.click();
  await expect(page.getByRole("listitem").filter({ has: page.getByRole("link") })).toHaveCount(4);
});

test("the same tag gets the same colour wherever it appears", async ({ page }) => {
  await page.goto("/notes");
  const cls = async (loc: ReturnType<typeof page.locator>) => (await loc.first().getAttribute("class")) ?? "";
  const ribbonA = page.getByRole("listitem").filter({ hasText: "Pasted" }).getByRole("button", { name: "Show notes tagged perf" });
  const ribbonB = page.getByRole("listitem").filter({ hasText: "Syncs" }).getByRole("button", { name: "Show notes tagged perf" });
  const tone = (c: string) => c.match(/text-(\w+)-200/)?.[1];
  expect(tone(await cls(ribbonA))).toBeTruthy();
  expect(tone(await cls(ribbonA))).toBe(tone(await cls(ribbonB)));
});

test("on a phone the cards stack in one column without sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/notes");
  const cards = page.getByRole("listitem").filter({ has: page.getByRole("link") });
  await expect(cards).toHaveCount(4);
  const [a, b] = [(await cards.nth(0).boundingBox())!, (await cards.nth(1).boundingBox())!];
  expect(Math.abs(a.x - b.x)).toBeLessThan(2);
  expect(b.y).toBeGreaterThan(a.y + a.height - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});
