import { test as anon, expect as anonExpect } from "@playwright/test";

import { test, expect } from "./fixtures/session";

// The five pillars, and the nav label each one carries in AppShell's
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

    test(`${path} header links the other four pillars, not itself`, async ({
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
