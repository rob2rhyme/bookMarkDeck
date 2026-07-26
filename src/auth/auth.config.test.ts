import { describe, it, expect } from "vitest";
import { resolveNextAuthUrl } from "./auth.config";

describe("resolveNextAuthUrl", () => {
  it("uses an explicit NEXTAUTH_URL above everything else", () => {
    expect(
      resolveNextAuthUrl({
        NEXTAUTH_URL: "https://bmarkdeck.example.app",
        VERCEL_PROJECT_PRODUCTION_URL: "prod.vercel.app",
        VERCEL_URL: "deploy-abc123.vercel.app",
      })
    ).toBe("https://bmarkdeck.example.app");
  });

  it("prefers the stable production domain over the per-deploy URL", () => {
    // The regression guard: a per-deployment host can never be registered as a
    // Google redirect URI, so it must not win.
    expect(
      resolveNextAuthUrl({
        VERCEL_PROJECT_PRODUCTION_URL: "prod.vercel.app",
        VERCEL_URL: "deploy-abc123.vercel.app",
      })
    ).toBe("https://prod.vercel.app");
  });

  it("falls back to VERCEL_URL only when no production domain is exposed", () => {
    expect(resolveNextAuthUrl({ VERCEL_URL: "deploy-abc123.vercel.app" })).toBe(
      "https://deploy-abc123.vercel.app"
    );
  });

  it("returns undefined off-Vercel (local dev relies on .env.local)", () => {
    expect(resolveNextAuthUrl({})).toBeUndefined();
  });
});
