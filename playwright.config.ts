import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

// The authenticated app needs real Google/Firebase credentials, so E2E only
// covers the reachable public surface: login, the legal pages, the auth
// redirect, and the security headers. Authenticated flows are out of scope
// here (they'd require a signed next-auth session cookie via storageState).
const dummyEnv: Record<string, string> = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "dummy",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "dummy",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "dummy",
  NEXT_PUBLIC_FIREBASE_APP_ID: "dummy",
  NEXTAUTH_URL: BASE_URL,
  NEXTAUTH_SECRET: "dummy-e2e-secret",
  GOOGLE_CLIENT_ID: "dummy",
  GOOGLE_CLIENT_SECRET: "dummy",
};

// Use the pre-installed Chromium when present; CI installs its own with
// `npx playwright install --with-deps chromium` and can leave this unset.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: "line",
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
