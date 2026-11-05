import { describe, expect, it } from "vitest";

import {
  fromHex,
  hashPin,
  hexEqual,
  isAppLockConfig,
  isValidPin,
  makePinConfig,
  toHex,
  verifyPin,
} from "@/lib/appLock/appLock";

describe("isValidPin", () => {
  it("accepts 4–8 digits", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("12345678")).toBe(true);
  });
  it("rejects too short, too long, and non-digits", () => {
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("123456789")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
    expect(isValidPin("")).toBe(false);
  });
});

describe("toHex / fromHex", () => {
  it("round-trips bytes", () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 255, 128]);
    expect(toHex(bytes)).toBe("00010f10ff80");
    expect([...fromHex("00010f10ff80")]).toEqual([...bytes]);
  });
});

describe("hexEqual", () => {
  it("is true only for identical strings", () => {
    expect(hexEqual("abcd", "abcd")).toBe(true);
    expect(hexEqual("abcd", "abce")).toBe(false);
    expect(hexEqual("abcd", "abcde")).toBe(false);
  });
});

describe("hashPin", () => {
  it("is deterministic for the same salt+pin and differs across salts", async () => {
    const a = await hashPin("1234", "aa");
    const b = await hashPin("1234", "aa");
    const c = await hashPin("1234", "bb");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });
});

describe("makePinConfig / verifyPin", () => {
  it("round-trips: the same PIN verifies, a wrong one does not", async () => {
    const config = await makePinConfig("4821");
    expect(config.pinSalt).toMatch(/^[0-9a-f]{32}$/);
    expect(await verifyPin(config, "4821")).toBe(true);
    expect(await verifyPin(config, "4822")).toBe(false);
  });

  it("never stores the raw PIN", async () => {
    const config = await makePinConfig("4821");
    expect(JSON.stringify(config)).not.toContain("4821");
  });

  it("rejects a malformed PIN without hashing", async () => {
    const config = await makePinConfig("4821");
    expect(await verifyPin(config, "48")).toBe(false);
  });
});

describe("isAppLockConfig", () => {
  it("accepts a well-formed config and rejects junk", () => {
    expect(isAppLockConfig({ pinHash: "x", pinSalt: "y" })).toBe(true);
    expect(isAppLockConfig({ pinHash: "x", pinSalt: "y", biometricId: "z" })).toBe(true);
    expect(isAppLockConfig({ pinHash: "x" })).toBe(false);
    expect(isAppLockConfig(null)).toBe(false);
    expect(isAppLockConfig("nope")).toBe(false);
  });
});
