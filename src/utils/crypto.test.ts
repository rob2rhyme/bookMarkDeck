import { describe, it, expect } from "vitest";
import { encryptJson, decryptJson, type EncryptedPayload } from "./crypto";

const enc = new TextEncoder();

function b64(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

// Replicates the pre-salt implementation: PBKDF2 with the fixed legacy salt and
// crucially NO `salt` field in the payload. Independent literal of the legacy
// salt string so that changing crypto.ts's LEGACY_SALT would break this test —
// it's the regression guard that old Drive backups keep decrypting.
async function legacyEncrypt<T>(
  passphrase: string,
  data: T
): Promise<EncryptedPayload> {
  const salt = enc.encode("bookmarkdeck-drive-sync");
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 150_000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(JSON.stringify(data))
  );
  return { iv: b64(iv), ciphertext: b64(new Uint8Array(encrypted)) };
}

describe("crypto AES-GCM", () => {
  const pass = "correct horse battery staple";
  const data = {
    bookmarks: [{ id: "1", title: "Hi", url: "https://x.com" }],
    updatedAt: "2026-01-01",
  };

  it("round-trips and stamps a per-payload salt", async () => {
    const payload = await encryptJson(pass, data);
    expect(payload.salt).toBeTruthy();
    const back = await decryptJson(pass, payload);
    expect(back).toEqual(data);
  });

  it("uses a fresh random salt + iv each time", async () => {
    const a = await encryptJson(pass, data);
    const b = await encryptJson(pass, data);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("decrypts a legacy (no-salt) payload via the fallback salt", async () => {
    const legacy = await legacyEncrypt(pass, data);
    expect(legacy.salt).toBeUndefined();
    const back = await decryptJson(pass, legacy);
    expect(back).toEqual(data);
  });

  it("rejects a wrong passphrase", async () => {
    const payload = await encryptJson(pass, data);
    await expect(decryptJson("wrong", payload)).rejects.toBeTruthy();
  });
});
