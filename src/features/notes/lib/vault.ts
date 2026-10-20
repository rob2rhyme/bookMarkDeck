// Locked notes: the cryptography. WebCrypto only — no dependency, nothing sent to
// a server that could read a locked note.
//
// Design (envelope encryption):
// - One random AES-256-GCM DATA KEY per vault encrypts every locked note's body.
// - That key is stored only WRAPPED, twice: by a key derived from the passphrase
//   (PBKDF2-SHA256, 600k iterations) and by one derived from a recovery code
//   shown once at setup. Either unwraps it; changing the passphrase re-wraps the
//   data key and touches no note.
// - Each note's ciphertext is bound to its note id (GCM additional data), so a
//   ciphertext copied onto another note fails to decrypt instead of showing the
//   wrong text there.
// - GCM authenticates, so a wrong passphrase is detected (unwrap throws) without
//   storing any check value.
// - Forgetting both the passphrase and the recovery code loses the locked notes.
//   That is the point: nobody else — including whoever runs the database — holds
//   a way in.
//
// A vault is a small public record (salts, IVs, wrapped keys); it is safe to sync.

export const PBKDF2_ITERATIONS = 600_000;
const VAULT_VERSION = 1;

export type Sealed = { iv: string; ct: string };

export type VaultRecord = {
  /** Vault id; every locked note records which vault it was locked with. */
  id: string;
  v: number;
  createdAt: string;
  pass: Sealed & { salt: string; iterations: number };
  recovery: Sealed & { salt: string; iterations: number };
};

/** What a locked note stores instead of its body. */
export type NoteLock = { kid: string; iv: string; ct: string };

/* ------------------------------------------------------------- encoding --- */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/* -------------------------------------------------------- recovery code --- */

// Crockford base32: no I, L, O or U, so it reads back unambiguously off paper.
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 20 random bytes as 32 Crockford characters, grouped XXXX-XXXX-…. */
export function newRecoveryCode(): string {
  const bytes = random(20);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{4}/g)!.join("-");
}

/** Canonical form of a typed code: case, spaces, dashes and look-alikes forgiven. */
export function normalizeRecoveryCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
}

/* ------------------------------------------------------------------ keys --- */

/** Passphrases are compared as typed, after Unicode NFKC (so "é" typed two ways matches). */
const passBytes = (secret: string) => enc.encode(secret.normalize("NFKC"));

async function deriveWrapKey(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", passBytes(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

async function wrap(dataKey: CryptoKey, secret: string, iterations: number) {
  const salt = random(16);
  const iv = random(12);
  const kek = await deriveWrapKey(secret, salt, iterations);
  const ct = new Uint8Array(await crypto.subtle.wrapKey("raw", dataKey, kek, { name: "AES-GCM", iv }));
  return { salt: toB64(salt), iv: toB64(iv), ct: toB64(ct), iterations };
}

async function unwrap(
  sealed: VaultRecord["pass"],
  secret: string,
  extractable: boolean
): Promise<CryptoKey> {
  const kek = await deriveWrapKey(secret, fromB64(sealed.salt), sealed.iterations);
  return crypto.subtle.unwrapKey(
    "raw",
    fromB64(sealed.ct),
    kek,
    { name: "AES-GCM", iv: fromB64(sealed.iv) },
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"]
  );
}

export class WrongSecretError extends Error {
  constructor() {
    super("That passphrase or recovery code doesn't match.");
    this.name = "WrongSecretError";
  }
}

/**
 * Create a vault. Returns the record to store, the recovery code to show ONCE,
 * and the data key (non-extractable) for this session.
 */
export async function createVault(
  passphrase: string,
  opts: { iterations?: number; now?: Date } = {}
): Promise<{ record: VaultRecord; recoveryCode: string; key: CryptoKey }> {
  const iterations = opts.iterations ?? PBKDF2_ITERATIONS;
  const dataKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const recoveryCode = newRecoveryCode();
  const record: VaultRecord = {
    id: crypto.randomUUID(),
    v: VAULT_VERSION,
    createdAt: (opts.now ?? new Date()).toISOString(),
    pass: await wrap(dataKey, passphrase, iterations),
    recovery: await wrap(dataKey, normalizeRecoveryCode(recoveryCode), iterations),
  };
  // Hold the session copy non-extractable: script running later can use it but
  // can never read its bytes out.
  const key = await unwrap(record.pass, passphrase, false);
  return { record, recoveryCode, key };
}

/** The vault's data key, or WrongSecretError. */
export async function openVault(record: VaultRecord, passphrase: string): Promise<CryptoKey> {
  try {
    return await unwrap(record.pass, passphrase, false);
  } catch {
    throw new WrongSecretError();
  }
}

/**
 * Forgotten passphrase: open with the recovery code and set a new passphrase.
 * Returns the updated record (same id, same data key — no note changes) and the
 * session key. The recovery code stays valid.
 */
export async function resetPassphrase(
  record: VaultRecord,
  recoveryCode: string,
  newPassphrase: string,
  opts: { iterations?: number } = {}
): Promise<{ record: VaultRecord; key: CryptoKey }> {
  let dataKey: CryptoKey;
  try {
    dataKey = await unwrap(record.recovery, normalizeRecoveryCode(recoveryCode), true);
  } catch {
    throw new WrongSecretError();
  }
  const next: VaultRecord = { ...record, pass: await wrap(dataKey, newPassphrase, opts.iterations ?? record.pass.iterations) };
  return { record: next, key: await unwrap(next.pass, newPassphrase, false) };
}

/* ----------------------------------------------------------------- notes --- */

const aad = (noteId: string) => enc.encode(`bookmarkdeck:note:v1:${noteId}`);

export async function encryptNote(key: CryptoKey, kid: string, noteId: string, text: string): Promise<NoteLock> {
  const iv = random(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(noteId) }, key, enc.encode(text));
  return { kid, iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

export async function decryptNote(key: CryptoKey, noteId: string, lock: NoteLock): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(lock.iv), additionalData: aad(noteId) },
    key,
    fromB64(lock.ct)
  );
  return dec.decode(pt);
}

/* ------------------------------------------------------------ validation --- */

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export function normalizeLock(raw: unknown): NoteLock | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return isStr(r.kid) && isStr(r.iv) && isStr(r.ct) ? { kid: r.kid, iv: r.iv, ct: r.ct } : null;
}

function normalizeSealed(raw: unknown): VaultRecord["pass"] | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isStr(r.salt) || !isStr(r.iv) || !isStr(r.ct)) return null;
  const iterations = typeof r.iterations === "number" && r.iterations >= 1 ? r.iterations : null;
  return iterations ? { salt: r.salt, iv: r.iv, ct: r.ct, iterations } : null;
}

export function normalizeVault(raw: unknown): VaultRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pass = normalizeSealed(r.pass);
  const recovery = normalizeSealed(r.recovery);
  if (!isStr(r.id) || !pass || !recovery) return null;
  return {
    id: r.id,
    v: typeof r.v === "number" ? r.v : VAULT_VERSION,
    createdAt: isStr(r.createdAt) ? r.createdAt : new Date(0).toISOString(),
    pass,
    recovery,
  };
}
