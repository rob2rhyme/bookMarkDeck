import { test as anon, expect as anonExpect } from "@playwright/test";

import { test, expect } from "./fixtures/session";

// The six pillars, and the nav label each one carries in AppShell's
// DESTINATIONS. Labels (not copy) are what the header renders as aria-labels.
// `title` is what each route serves in <title>. `/` has no title of its own, so
// it falls back to the root layout's `title.default`; the rest are suffixed by
// `title.template`.
const PILLARS = [
  { path: "/", label: "Bookmarks", title: "Bookmark Deck" },
  { path: "/focus", label: "Focus", title: "Focus · Bookmark Deck" },
  { path: "/habits", label: "Habits", title: "Habits · Bookmark Deck" },
  { path: "/inventory", label: "My Stuff", title: "My Stuff · Bookmark Deck" },
  { path: "/filing", label: "Filing", title: "Filing · Bookmark Deck" },
  { path: "/notes", label: "Notes", title: "Notes · Bookmark Deck" },
] as const;

anon.describe("auth gate", () => {
  // Only `/` was covered before. A pillar that stopped redirecting would be a
  // security regression, so each one is asserted rather than assumed.
  for (const { path } of PILLARS) {
    anon(`${path} redirects to /login when signed out`, async ({ page }) => {
      await page.goto(path);
      await anonExpect(page).toHaveURL(/\/login(\?|$)/);
    });
  }
});

test.describe("signed in", () => {
  for (const { path, label, title } of PILLARS) {
    test(`${path} serves its own <title>`, async ({ page }) => {
      // The per-route anchor that did not exist when these specs were written:
      // every route used to serve "Bookmark Deck". Catches a missing title, a
      // wrong one, and the template silently ceasing to apply.
      await page.goto(path);
      await expect(page).toHaveTitle(title);
    });

    test(`${path} renders inside the app shell`, async ({ page }) => {
      const crashes: string[] = [];
      // `pageerror` only — uncaught exceptions. NOT console: Firebase cannot
      // sign in with dummy config, which is the designed best-effort path and
      // logs expected noise. Asserting no console errors would assert the
      // wrong thing and flake.
      page.on("pageerror", (e) => crashes.push(String(e)));

      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(
        page.getByRole("heading", { name: "Bookmark Deck" })
      ).toBeVisible();
      expect(crashes, `uncaught error on ${path}`).toEqual([]);
    });

    test(`${path} header links the other five pillars, not itself`, async ({
      page,
    }) => {
      // AppShell builds
      //   otherTabs = DESTINATIONS.filter(d => d.href !== activeHref)
      // so the header omits the page you are on. That makes this the assertion
      // that identifies the route: there is no per-route <title> (every page is
      // "Bookmark Deck"), and Inventory/Filing expose no stable headings or
      // SectionNav ids to anchor on.
      await page.goto(path);
      const header = page.locator("header");

      for (const other of PILLARS.filter((p) => p.path !== path)) {
        await expect(
          header.getByRole("link", { name: other.label, exact: true }),
          `${path} should link ${other.label}`
        ).toBeVisible();
      }

      await expect(
        header.getByRole("link", { name: label, exact: true })
      ).toHaveCount(0);
    });
  }

  // Assert each pillar rendered its OWN content, not just the shell around it.
  // With no Firestore data these run against the empty state, so what to anchor
  // on differs per pillar.
  test("/focus renders the timer section", async ({ page }) => {
    // The timer renders regardless of data, so its SectionNav id is reachable.
    await page.goto("/focus");
    await expect(page.locator("#sec-timer")).toBeAttached();
  });

  test("/notes: a new note autosaves and continues a list", async ({ page }) => {
    await page.goto("/notes");
    await page.getByRole("button", { name: "New note", exact: true }).click();
    await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
    await expect(page.getByLabel("Title", { exact: true })).toBeFocused();
    await page.getByLabel("Title", { exact: true }).fill("Groceries");
    const body = page.getByLabel("Note", { exact: true });
    await body.click();
    await body.pressSequentially("- milk");
    await body.press("Enter");
    await expect(body).toHaveValue("- milk\n- ");
    // The continuation goes through execCommand, so it is on the undo stack
    // like any keystroke — setting `value` directly would have wiped it.
    await body.press("ControlOrMeta+z");
    await expect(body).toHaveValue("- milk");
    await body.press("Enter");
    await body.pressSequentially("eggs");
    await expect(body).toHaveValue("- milk\n- eggs");
    await expect(page.getByRole("status")).toContainText(/Saved/);
    await page.getByRole("link", { name: "Notes", exact: true }).first().click();
    await expect(page.getByRole("link", { name: "Groceries" })).toBeVisible();
  });

  test("/notes: tag a note, then find it by search and by tag", async ({ page }) => {
    await page.goto("/notes");
    await page.getByRole("button", { name: "New note", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill("Café list");
    const tagBox = page.getByRole("combobox", { name: "Add tag" });
    await tagBox.fill("Errands");
    await tagBox.press("Enter");
    await page.getByLabel("Note", { exact: true }).fill("oat milk\nbeans");
    await page.getByRole("link", { name: "Notes", exact: true }).first().click();

    const search = page.getByRole("searchbox", { name: "Search notes" });
    await search.fill("cafe beans");
    await expect(page.getByRole("status")).toHaveText(/1 note/);
    await expect(page.locator("mark").first()).toHaveText("Café");
    await expect(page).toHaveURL(/\?q=cafe\+beans/);
    await search.press("Escape");

    await page.getByRole("group", { name: "Filter by tag" }).getByRole("button", { name: /#errands/ }).click();
    await expect(page.getByRole("link", { name: "Café list" })).toBeVisible();
    await expect(page).toHaveURL(/\?tag=errands/);
  });

  test("/notes: format with the toolbar, undo it, preview and tick a box", async ({ page }) => {
    await page.goto("/notes");
    await page.getByRole("button", { name: "New note", exact: true }).click();
    const body = page.getByLabel("Note", { exact: true });
    await body.click();
    await body.pressSequentially("[ ] call the bank");
    await body.press("Shift+Home");
    await page.getByRole("button", { name: "Bold" }).click();
    await expect(body).toHaveValue("**[ ] call the bank**");
    // Formatting goes through the native undo stack, like typing.
    await body.press("ControlOrMeta+z");
    await expect(body).toHaveValue("[ ] call the bank");

    await page.getByRole("button", { name: "preview" }).click();
    const box = page.getByRole("checkbox", { name: "Mark as done" });
    await box.check();
    await page.getByRole("button", { name: "edit" }).click();
    await expect(page.getByLabel("Note", { exact: true })).toHaveValue("[x] call the bank");
  });

  test("mobile bottom nav omits the pillar you are on", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto("/notes");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link")).toHaveCount(5);
    await expect(nav.getByRole("link", { name: "Notes" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Filing" })).toBeVisible();
  });

  test("/habits renders its empty state", async ({ page }) => {
    // Habits takes an empty-state branch with no habits — the SectionNav and
    // `#hsec-summary` live in the `else`, so they do not exist here. The
    // create CTA is what this pillar actually shows a new user.
    await page.goto("/habits");
    await expect(
      page.getByRole("button", { name: /new habit/i })
    ).toBeVisible();
  });
});
