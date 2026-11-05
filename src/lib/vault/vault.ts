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

/**
 * The iteration counts a vault record may carry. The count is stored beside the
 * wrapped key, so whoever controls the database controls it: a record lowered to
 * one iteration would still unwrap — and a passphrase reset used to re-wrap at the
 * stored count, handing the new passphrase over at the cost of one hash. Records
 * outside this range are refused, and every wrap uses PBKDF2_ITERATIONS. The
 * ceiling stops a record freezing the tab. Tests lower `min` for speed.
 */
export const vaultIterationLimits = { min: PBKDF2_ITERATIONS, max: 5_000_000 };
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
  if (!iterationsAllowed(sealed.iterations)) throw new WrongSecretError();
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
  const next: VaultRecord = { ...record, pass: await wrap(dataKey, newPassphrase, opts.iterations ?? PBKDF2_ITERATIONS) };
  return { record: next, key: await unwrap(next.pass, newPassphrase, false) };
}

/* ---------------------------------------------------------------- sealing --- */

/** What a locked record stores in place of its sensitive text. */
export type SealedText = NoteLock;

/**
 * Ciphertext is bound to WHAT it belongs to — the kind of record and its id — as GCM
 * additional data. So a note's ciphertext pasted onto a paper fails to open instead
 * of showing the wrong text there, and so does one paper's onto another.
 */
const aad = (context: string, id: string) => enc.encode(`bookmarkdeck:${context}:v1:${id}`);

export async function sealText(key: CryptoKey, kid: string, context: string, id: string, text: string): Promise<SealedText> {
  const iv = random(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(context, id) }, key, enc.encode(text));
  return { kid, iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

export async function openText(key: CryptoKey, context: string, id: string, sealed: SealedText): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(sealed.iv), additionalData: aad(context, id) },
    key,
    fromB64(sealed.ct)
  );
  return dec.decode(pt);
}

/** Bytes of IV at the front of a sealed binary blob. */
const IV_BYTES = 12;

/**
 * Seal a file's bytes. The result is ONE self-contained blob — `iv ‖ ciphertext+tag` —
 * so an uploaded object needs nothing beside it to be opened except the key and the
 * (context, id) it was sealed under. Which vault's key it was sealed with is recorded
 * by the caller, as `kid` is for text.
 */
export async function sealBytes(
  key: CryptoKey,
  context: string,
  id: string,
  data: ArrayBuffer
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = random(IV_BYTES);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(context, id) }, key, data));
  const out = new Uint8Array(IV_BYTES + ct.length);
  out.set(iv, 0);
  out.set(ct, IV_BYTES);
  return out;
}

/** The inverse of `sealBytes`; throws if the key, context, id or bytes are not the ones it was sealed with. */
export async function openBytes(
  key: CryptoKey,
  context: string,
  id: string,
  sealed: ArrayBuffer
): Promise<ArrayBuffer> {
  if (sealed.byteLength <= IV_BYTES) throw new Error("sealed blob is too short");
  const bytes = new Uint8Array(sealed);
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, IV_BYTES), additionalData: aad(context, id) },
    key,
    bytes.slice(IV_BYTES)
  );
}

/** What sealing adds to a file's size: the IV and GCM's 16-byte tag. */
export const SEAL_OVERHEAD = IV_BYTES + 16;

/* ----------------------------------------------------------------- notes --- */

// "note" is the context Notes has always sealed under; changing it would strand
// every locked note.
export const encryptNote = (key: CryptoKey, kid: string, noteId: string, text: string): Promise<NoteLock> =>
  sealText(key, kid, "note", noteId, text);

export const decryptNote = (key: CryptoKey, noteId: string, lock: NoteLock): Promise<string> =>
  openText(key, "note", noteId, lock);

/* ------------------------------------------------------------ validation --- */

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export function normalizeLock(raw: unknown): NoteLock | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return isStr(r.kid) && isStr(r.iv) && isStr(r.ct) ? { kid: r.kid, iv: r.iv, ct: r.ct } : null;
}

function iterationsAllowed(n: unknown): n is number {
  return (
    typeof n === "number" &&
    Number.isInteger(n) &&
    n >= vaultIterationLimits.min &&
    n <= vaultIterationLimits.max
  );
}

function normalizeSealed(raw: unknown): VaultRecord["pass"] | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isStr(r.salt) || !isStr(r.iv) || !isStr(r.ct)) return null;
  const iterations = iterationsAllowed(r.iterations) ? r.iterations : null;
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
