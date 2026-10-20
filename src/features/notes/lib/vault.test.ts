import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PBKDF2_ITERATIONS,
  createVault,
  decryptNote,
  encryptNote,
  newRecoveryCode,
  normalizeLock,
  normalizeRecoveryCode,
  normalizeVault,
  openVault,
  resetPassphrase,
  vaultIterationLimits,
  WrongSecretError,
} from "./vault";

// Real PBKDF2 at a test-sized cost; the production default is pinned separately.
const FAST = { iterations: 1_000 };
beforeAll(() => {
  vaultIterationLimits.min = 1_000;
});
afterAll(() => {
  vaultIterationLimits.min = PBKDF2_ITERATIONS;
});

describe("vault", () => {
  it("uses 600k PBKDF2 iterations by default (OWASP 2023 for SHA-256)", () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000);
  });

  it("round-trips a note through encryption with the passphrase", async () => {
    const { record, key } = await createVault("correct horse", FAST);
    const lock = await encryptNote(key, record.id, "note-1", "Wifi: hunter2 ✓");
    expect(lock.kid).toBe(record.id);
    expect(lock.ct).not.toContain("hunter2");
    const reopened = await openVault(record, "correct horse");
    expect(await decryptNote(reopened, "note-1", lock)).toBe("Wifi: hunter2 ✓");
  });

  it("rejects a wrong passphrase", async () => {
    const { record } = await createVault("correct horse", FAST);
    await expect(openVault(record, "correct hors")).rejects.toBeInstanceOf(WrongSecretError);
  });

  it("binds ciphertext to its note: copied onto another note it won't open", async () => {
    const { record, key } = await createVault("pw-pw-pw-pw", FAST);
    const lock = await encryptNote(key, record.id, "note-1", "secret");
    await expect(decryptNote(key, "note-2", lock)).rejects.toThrow();
  });

  it("uses a fresh IV every time", async () => {
    const { record, key } = await createVault("pw-pw-pw-pw", FAST);
    const a = await encryptNote(key, record.id, "n", "same");
    const b = await encryptNote(key, record.id, "n", "same");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it("the recovery code resets the passphrase without touching notes", async () => {
    const { record, recoveryCode, key } = await createVault("forgotten", FAST);
    const lock = await encryptNote(key, record.id, "n", "kept");
    const typed = recoveryCode.toLowerCase().replace(/-/g, " ");
    const reset = await resetPassphrase(record, typed, "brand new", FAST);
    expect(reset.record.id).toBe(record.id);
    expect(await decryptNote(reset.key, "n", lock)).toBe("kept");
    await expect(openVault(reset.record, "forgotten")).rejects.toBeInstanceOf(WrongSecretError);
    expect(await decryptNote(await openVault(reset.record, "brand new"), "n", lock)).toBe("kept");
    // The recovery code still works afterwards.
    await expect(resetPassphrase(reset.record, recoveryCode, "again", FAST)).resolves.toBeTruthy();
  });

  it("rejects a wrong recovery code", async () => {
    const { record } = await createVault("pw-pw-pw-pw", FAST);
    await expect(resetPassphrase(record, newRecoveryCode(), "x", FAST)).rejects.toBeInstanceOf(WrongSecretError);
  });

  it("keeps the session key non-extractable", async () => {
    const { key } = await createVault("pw-pw-pw-pw", FAST);
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });

  it("stores nothing secret in the record", async () => {
    const { record, recoveryCode } = await createVault("my passphrase", FAST);
    const json = JSON.stringify(record);
    expect(json).not.toContain("my passphrase");
    expect(json).not.toContain(normalizeRecoveryCode(recoveryCode));
  });
});

describe("recovery codes", () => {
  it("are 32 Crockford base32 characters in groups of four", () => {
    const code = newRecoveryCode();
    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(newRecoveryCode()).not.toBe(code);
  });

  it("forgive case, spacing and look-alike letters", () => {
    expect(normalizeRecoveryCode("ab0o- il1 u")).toBe("AB00111V");
  });
});

describe("normalizers", () => {
  it("accept only complete locks and vaults", async () => {
    expect(normalizeLock({ kid: "k", iv: "i", ct: "c" })).toEqual({ kid: "k", iv: "i", ct: "c" });
    expect(normalizeLock({ kid: "k", iv: "i" })).toBeNull();
    expect(normalizeLock(null)).toBeNull();
    const { record } = await createVault("pw-pw-pw-pw", FAST);
    expect(normalizeVault(JSON.parse(JSON.stringify(record)))).toEqual(record);
    expect(normalizeVault({ ...record, pass: { ...record.pass, iterations: 0 } })).toBeNull();
  });
});

describe("a tampered iteration count", () => {
  // Whoever controls the database controls the stored count. Lowering it must
  // not make the passphrase (or a new one, after a reset) cheap to guess.
  it("is refused when reading a vault, below the floor and above the ceiling", async () => {
    const { record } = await createVault("pw-pw-pw-pw", FAST);
    expect(normalizeVault({ ...record, pass: { ...record.pass, iterations: 999 } })).toBeNull();
    expect(normalizeVault({ ...record, recovery: { ...record.recovery, iterations: 1e12 } })).toBeNull();
    expect(normalizeVault({ ...record, pass: { ...record.pass, iterations: 1_000.5 } })).toBeNull();
  });

  it("is refused at unlock, so nothing is derived at the lowered cost", async () => {
    const { record } = await createVault("pw-pw-pw-pw", FAST);
    vaultIterationLimits.min = PBKDF2_ITERATIONS;
    try {
      await expect(openVault(record, "pw-pw-pw-pw")).rejects.toBeInstanceOf(WrongSecretError);
    } finally {
      vaultIterationLimits.min = 1_000;
    }
  });

  it("is never carried into a passphrase reset — the new passphrase is wrapped at the standard cost", async () => {
    const { record, recoveryCode } = await createVault("old pass", FAST);
    const reset = await resetPassphrase(record, recoveryCode, "new pass");
    expect(reset.record.pass.iterations).toBe(PBKDF2_ITERATIONS);
    expect(reset.record.recovery).toEqual(record.recovery);
  });
});
