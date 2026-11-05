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
  SEAL_OVERHEAD,
  openBytes,
  openText,
  openVault,
  resetPassphrase,
  sealBytes,
  sealText,
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

  it("seals under a record kind: a paper's ciphertext does not open as a note, or as another paper", async () => {
    const { record, key } = await createVault("pw-pw-pw-pw", FAST);
    const sealed = await sealText(key, record.id, "filing", "p1", '{"reference":"POL-1"}');
    expect(sealed.ct).not.toContain("POL");
    expect(await openText(key, "filing", "p1", sealed)).toBe('{"reference":"POL-1"}');
    await expect(openText(key, "note", "p1", sealed)).rejects.toThrow();
    await expect(openText(key, "filing", "p2", sealed)).rejects.toThrow();
  });

  it("keeps sealing notes under the context they were always sealed with", async () => {
    // A locked note written before the vault was shared must still open: "note" is
    // part of every existing ciphertext's additional data.
    const { record, key } = await createVault("pw-pw-pw-pw", FAST);
    const lock = await encryptNote(key, record.id, "n1", "old text");
    expect(await openText(key, "note", "n1", lock)).toBe("old text");
    const viaText = await sealText(key, record.id, "note", "n1", "new text");
    expect(await decryptNote(key, "n1", viaText)).toBe("new text");
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

describe("sealing bytes", () => {
  const bytes = (...n: number[]) => new Uint8Array(n).buffer;

  it("round-trips, and the sealed blob is iv ‖ ciphertext+tag with nothing readable in it", async () => {
    const { record, key } = await createVault("pw-pw-pw-pw", FAST);
    const data = new TextEncoder().encode("PASSPORT 123456789").buffer as ArrayBuffer;
    const sealed = await sealBytes(key, "filing-scan", "a1", data);
    expect(sealed.length).toBe(data.byteLength + SEAL_OVERHEAD);
    expect(new TextDecoder().decode(sealed)).not.toContain("PASSPORT");
    const back = await openBytes(key, "filing-scan", "a1", sealed.buffer);
    expect(new TextDecoder().decode(back)).toBe("PASSPORT 123456789");
    expect(record.id).toBeTruthy();
  });

  it("is bound to its context and id — a swapped pointer or another kind of record won't open it", async () => {
    const { key } = await createVault("pw-pw-pw-pw", FAST);
    const sealed = await sealBytes(key, "filing-scan", "a1", bytes(1, 2, 3));
    await expect(openBytes(key, "filing-scan", "a2", sealed.buffer)).rejects.toThrow();
    await expect(openBytes(key, "note", "a1", sealed.buffer)).rejects.toThrow();
  });

  it("detects tampering and refuses a blob too short to hold an IV", async () => {
    const { key } = await createVault("pw-pw-pw-pw", FAST);
    const sealed = await sealBytes(key, "filing-scan", "a1", bytes(1, 2, 3, 4));
    const flipped = sealed.slice();
    flipped[flipped.length - 1] ^= 1;
    await expect(openBytes(key, "filing-scan", "a1", flipped.buffer)).rejects.toThrow();
    await expect(openBytes(key, "filing-scan", "a1", new Uint8Array(12).buffer)).rejects.toThrow(/too short/);
  });

  it("uses a fresh IV each time, and handles an empty file", async () => {
    const { key } = await createVault("pw-pw-pw-pw", FAST);
    const a = await sealBytes(key, "filing-scan", "a1", bytes());
    const b = await sealBytes(key, "filing-scan", "a1", bytes());
    expect(a.slice(0, 12)).not.toEqual(b.slice(0, 12));
    expect((await openBytes(key, "filing-scan", "a1", a.buffer)).byteLength).toBe(0);
  });
});
