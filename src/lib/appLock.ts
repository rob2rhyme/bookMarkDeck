// App-lock crypto for the My Stuff privacy screen. Honest scope: this is a
// convenience lock (a quick screen so a passer-by can't browse your inventory
// on an unlocked device), NOT encryption — the data still lives in Firestore /
// localStorage, and the real security boundary is your Google sign-in. We store
// a salted SHA-256 of the PIN (never the PIN itself) so a glance at localStorage
// doesn't reveal it. Pure + deterministic given a salt (see appLock.test.ts);
// WebAuthn/biometric lives in the hook, not here.

export type AppLockConfig = {
  pinHash: string; // hex SHA-256 of `${pinSalt}:${pin}`
  pinSalt: string; // hex
  biometricId?: string; // base64url WebAuthn credential id, if enrolled
};

const PIN_RE = /^\d{4,8}$/;

/** A PIN is 4–8 digits. Short enough to be calm, long enough to not be 0000-guessable at a glance. */
export function isValidPin(pin: string): boolean {
  return PIN_RE.test(pin);
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Random hex salt from the platform CSPRNG. Call only in event handlers (never during render). */
export function randomSaltHex(bytes = 16): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a);
}

export async function hashPin(pin: string, saltHex: string): Promise<string> {
  const data = new TextEncoder().encode(`${saltHex}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(digest));
}

/** Build a fresh PIN config (new random salt). */
export async function makePinConfig(pin: string): Promise<AppLockConfig> {
  const pinSalt = randomSaltHex();
  const pinHash = await hashPin(pin, pinSalt);
  return { pinHash, pinSalt };
}

/** Constant-time-ish compare of two equal-length hex strings. */
export function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when `pin` matches the stored config. Rejects malformed PINs up front. */
export async function verifyPin(config: AppLockConfig, pin: string): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  const h = await hashPin(pin, config.pinSalt);
  return hexEqual(h, config.pinHash);
}

/** Narrow an unknown (localStorage) value to a usable config. */
export function isAppLockConfig(v: unknown): v is AppLockConfig {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return typeof c.pinHash === "string" && typeof c.pinSalt === "string";
}
