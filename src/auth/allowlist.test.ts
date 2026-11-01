import { afterEach, describe, expect, it } from "vitest";

import { allowedEmails, isAllowedEmail } from "./allowlist";
import { authConfig } from "./auth.config";

const saved = process.env.AUTH_ALLOWED_EMAILS;
afterEach(() => {
  if (saved === undefined) delete process.env.AUTH_ALLOWED_EMAILS;
  else process.env.AUTH_ALLOWED_EMAILS = saved;
});

describe("sign-in allowlist", () => {
  it("defaults to the owner when the variable is unset, so a deploy can't fall open", () => {
    delete process.env.AUTH_ALLOWED_EMAILS;
    expect(allowedEmails()).toEqual(["rob2rhyme@gmail.com", "noah18thapa@gmail.com"]);
    expect(isAllowedEmail("Rob2Rhyme@Gmail.com ")).toBe(true);
    expect(isAllowedEmail("someone@gmail.com")).toBe(false);
    expect(isAllowedEmail(undefined)).toBe(false);
  });

  it("takes a comma-separated list from AUTH_ALLOWED_EMAILS", () => {
    process.env.AUTH_ALLOWED_EMAILS = " A@x.com, b@y.com ,";
    expect(allowedEmails()).toEqual(["a@x.com", "b@y.com"]);
    expect(isAllowedEmail("rob2rhyme@gmail.com")).toBe(false);
  });
});

describe("next-auth callbacks", () => {
  const signIn = authConfig.callbacks!.signIn!;
  const jwt = authConfig.callbacks!.jwt!;
  const asSignIn = (email: string, email_verified?: boolean) =>
    signIn({ user: { id: "1", email }, account: null, profile: { email_verified } } as never);

  it("lets the owner sign in and refuses anyone else", async () => {
    process.env.AUTH_ALLOWED_EMAILS = "owner@example.com";
    expect(await asSignIn("owner@example.com", true)).toBe(true);
    expect(await asSignIn("stranger@example.com", true)).toBe(false);
  });

  it("refuses the owner's address when Google hasn't verified it", async () => {
    process.env.AUTH_ALLOWED_EMAILS = "owner@example.com";
    expect(await asSignIn("owner@example.com", false)).toBe(false);
  });

  it("ends an existing session for an account not on the list", async () => {
    process.env.AUTH_ALLOWED_EMAILS = "owner@example.com";
    const token = { email: "stranger@example.com", expiresAt: Date.now() + 3_600_000 };
    await expect(jwt({ token } as never)).rejects.toThrow();
    const mine = { email: "owner@example.com", expiresAt: Date.now() + 3_600_000 };
    await expect(jwt({ token: mine } as never)).resolves.toMatchObject({ email: "owner@example.com" });
  });
});

describe("firestore.rules", () => {
  // Rules can't read env or import, so they repeat the owner list. If the two
  // drift, the app lets someone in whom the database then refuses (or the reverse).
  it("admits exactly the accounts the app's default allowlist does", async () => {
    const { readFileSync } = await import("node:fs");
    const { DEFAULT_ALLOWED_EMAILS } = await import("./allowlist");
    const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
    const list = /function allowedEmails\(\)\s*\{\s*return\s*\[([^\]]*)\]/.exec(rules)?.[1];
    expect(list, "allowedEmails() not found in firestore.rules").toBeTruthy();
    const emails = [...list!.matchAll(/'([^']+)'/g)].map((m) => m[1].toLowerCase());
    expect(emails.sort()).toEqual([...DEFAULT_ALLOWED_EMAILS].map((e) => e.toLowerCase()).sort());
  });
});

describe("session lifetime", () => {
  it("expires after 14 idle days, not next-auth's default 30", () => {
    expect(authConfig.session).toMatchObject({ strategy: "jwt", maxAge: 14 * 24 * 60 * 60 });
  });
});
