import { beforeEach, describe, expect, it, vi } from "vitest";

// ensureFirebaseGoogleAuth caches its in-flight promise at module level so two
// pillars asking at once share one popup. That cache must not outlive a
// FAILURE: a closed or blocked popup used to leave the rejection cached, and
// every later "Sign in to sync" returned it without opening a popup — on every
// pillar, until a full reload — so "allow popups and try again" could not work.
const auth = vi.hoisted(() => ({ currentUser: null as { email: string } | null }));

vi.mock("firebase/app", () => ({
  getApps: () => [],
  getApp: vi.fn(),
  initializeApp: () => ({}),
}));
vi.mock("firebase/firestore", () => ({ getFirestore: () => ({}) }));
vi.mock("firebase/auth", () => ({
  getAuth: () => auth,
  getRedirectResult: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signInWithCredential: vi.fn(),
  signOut: vi.fn(),
  // Constructed with `new`, so a regular function rather than an arrow.
  GoogleAuthProvider: vi.fn(function () {
    return { setCustomParameters: vi.fn() };
  }),
}));

import { getRedirectResult, signInWithPopup } from "firebase/auth";

const USER = { email: "a@example.com" };

// A fresh module per test: a SUCCESSFUL sign-in stays cached by design, so a
// shared module would leak one test's outcome into the next.
let ensureFirebaseGoogleAuth: typeof import("./firebase").ensureFirebaseGoogleAuth;

beforeEach(async () => {
  vi.resetModules();
  ({ ensureFirebaseGoogleAuth } = await import("./firebase"));
  auth.currentUser = null;
  vi.mocked(getRedirectResult).mockReset().mockResolvedValue(null);
  vi.mocked(signInWithPopup).mockReset();
});

describe("ensureFirebaseGoogleAuth", () => {
  it.each([
    ["blocked", "auth/popup-blocked"],
    ["closed", "auth/popup-closed-by-user"],
    ["failed for another reason", "auth/network-request-failed"],
  ])("opens a fresh popup on retry after the first was %s", async (_label, code) => {
    vi.mocked(signInWithPopup)
      .mockRejectedValueOnce(Object.assign(new Error(code), { code }))
      .mockResolvedValueOnce({ user: USER } as never);

    await expect(ensureFirebaseGoogleAuth("a@example.com")).rejects.toThrow();
    await expect(ensureFirebaseGoogleAuth("a@example.com")).resolves.toBe(USER);
    expect(signInWithPopup).toHaveBeenCalledTimes(2);
  });

  it("still shares one popup between concurrent callers", async () => {
    vi.mocked(signInWithPopup).mockResolvedValue({ user: USER } as never);

    const [a, b] = await Promise.all([
      ensureFirebaseGoogleAuth("a@example.com"),
      ensureFirebaseGoogleAuth("a@example.com"),
    ]);
    expect(a).toBe(USER);
    expect(b).toBe(USER);
    expect(signInWithPopup).toHaveBeenCalledTimes(1);
  });
});
