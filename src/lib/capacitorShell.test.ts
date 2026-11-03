import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import config from "../../capacitor.config";

// The native app loads the live site; offline it must show a page of its own, not
// a blank error (App Review tests Airplane Mode). These keep that wired.
const root = join(__dirname, "../..");

describe("Capacitor shell offline page", () => {
  it("names a local error page that exists in webDir", () => {
    const errorPath = config.server?.errorPath;
    expect(errorPath).toBe("offline.html");
    expect(existsSync(join(root, config.webDir ?? "", errorPath!))).toBe(true);
  });

  it("retries the same live site the shell loads", () => {
    const page = readFileSync(join(root, "public/offline.html"), "utf8");
    const live = /var LIVE = "([^"]+)"/.exec(page)?.[1];
    expect(live).toBeTruthy();
    expect(new URL(live!).origin).toBe(new URL(config.server!.url!).origin);
  });

  it("doesn't leave the page's retry as a bare reload when run inside the app", () => {
    const page = readFileSync(join(root, "public/offline.html"), "utf8");
    expect(page).toContain('location.protocol === "capacitor:"');
    expect(page).toContain("location.replace(LIVE)");
  });

  it("is a plain https site with no cleartext", () => {
    expect(new URL(config.server!.url!).protocol).toBe("https:");
    expect(config.server!.cleartext).toBe(false);
  });
});
