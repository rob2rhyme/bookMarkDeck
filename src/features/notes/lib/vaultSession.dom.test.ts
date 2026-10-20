import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IDLE_LOCK_MS, addKeys, isUnlocked, keyFor, lock, onBeforeLock, resetVaultSessionForTests, touch } from "./vaultSession";

const fakeKey = {} as CryptoKey;

beforeEach(() => {
  vi.useFakeTimers();
  resetVaultSessionForTests();
});
afterEach(() => vi.useRealTimers());

describe("vault session", () => {
  it("holds keys until locked", async () => {
    addKeys([["v1", fakeKey]]);
    expect(isUnlocked()).toBe(true);
    expect(keyFor("v1")).toBe(fakeKey);
    await lock();
    expect(isUnlocked()).toBe(false);
    expect(keyFor("v1")).toBeUndefined();
  });

  it("locks itself after 10 idle minutes; activity pushes that back", async () => {
    expect(IDLE_LOCK_MS).toBe(600_000);
    addKeys([["v1", fakeKey]]);
    await vi.advanceTimersByTimeAsync(IDLE_LOCK_MS - 1000);
    touch();
    await vi.advanceTimersByTimeAsync(IDLE_LOCK_MS - 1000);
    expect(isUnlocked()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(isUnlocked()).toBe(false);
  });

  it("waits for before-lock work (an editor's last save) while the key still exists", async () => {
    addKeys([["v1", fakeKey]]);
    let sawKey: CryptoKey | undefined;
    onBeforeLock(async () => {
      await Promise.resolve();
      sawKey = keyFor("v1");
    });
    await lock();
    expect(sawKey).toBe(fakeKey);
    expect(isUnlocked()).toBe(false);
  });

  it("a failing before-lock hook doesn't keep the vault open", async () => {
    addKeys([["v1", fakeKey]]);
    onBeforeLock(() => Promise.reject(new Error("save failed")));
    await lock();
    expect(isUnlocked()).toBe(false);
  });
});
