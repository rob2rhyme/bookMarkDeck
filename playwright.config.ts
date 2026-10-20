import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

// E2E covers the public surface: login, the legal pages, the auth redirect, and
// the security headers.
//
// The authenticated app is NOT out of reach, despite what this comment used to
// claim. The gate is `getServerSession(authConfig)`, which only verifies a
// next-auth JWT against NEXTAUTH_SECRET — no Google round-trip — so a cookie
// minted with `next-auth/jwt`'s `encode()` and the dummy secret below passes it.
// Real Firebase credentials are needed only for live Firestore sync, which is
// opt-in and simply stays off. Authed specs are worth adding; nothing here
// blocks them.
// Exported so e2e/fixtures/session.ts signs its forged cookie with the very
// secret the server verifies against — two copies would drift apart silently.
export const E2E_SECRET = "dummy-e2e-secret";

const dummyEnv: Record<string, string> = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "dummy",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "dummy",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "dummy",
  NEXT_PUBLIC_FIREBASE_APP_ID: "dummy",
  NEXTAUTH_URL: BASE_URL,
  NEXTAUTH_SECRET: E2E_SECRET,
  GOOGLE_CLIENT_ID: "dummy",
  GOOGLE_CLIENT_SECRET: "dummy",
  // The sign-in allowlist (src/auth/allowlist.ts): the fixture's account only.
  AUTH_ALLOWED_EMAILS: "e2e@example.com",
};

// Use the pre-installed Chromium when present; CI installs its own with
// `npx playwright install --with-deps chromium` and can leave this unset.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // This suite blocks merges, which changes what the config has to guarantee:
  // - `retries` was never set (default 0), so `trace: "on-first-retry"` below
  //   could never fire. Two retries on CI absorb genuine browser flake and make
  //   the trace actually get captured when something does fail.
  // - `forbidOnly` because a stray `test.only` would quietly shrink the suite to
  //   one test and still exit 0 — a silent hole in a blocking gate.
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : "line",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          ...(executablePath ? { executablePath } : {}),
          args: ["--no-sandbox"],
        },
      },
    },
  ],
  webServer: {
    command: `next build && next start -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: dummyEnv,
  },
});
