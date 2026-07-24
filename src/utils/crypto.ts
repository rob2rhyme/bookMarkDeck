// src/utils/crypto.ts
// Small crypto helpers for client-side encryption using Web Crypto (AES-GCM).

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Legacy fixed salt used before per-payload random salts. Kept ONLY as a
// decrypt fallback so Drive backups written by older clients (payloads with no
// `salt` field) still open. New payloads always carry their own random salt.
const LEGACY_SALT = encoder.encode("bookmarkdeck-drive-sync");

const SALT_BYTES = 16;

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function base64Decode(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function deriveKey(passphrase: string, salt: BufferSource) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 150_000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export type EncryptedPayload = { iv: string; ciphertext: string; salt?: string };

export async function encryptJson<T>(
  passphrase: string,
  data: T
): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(passphrase, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = encoder.encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    salt: base64Encode(salt),
    iv: base64Encode(iv),
    ciphertext: base64Encode(new Uint8Array(encrypted)),
  };
}

export async function decryptJson<T>(
  passphrase: string,
  payload: EncryptedPayload
): Promise<T> {
  // Use the payload's own salt; fall back to the legacy fixed salt for backups
  // written before per-payload salts existed.
  const salt = payload.salt
    ? new Uint8Array(base64Decode(payload.salt))
    : LEGACY_SALT;
  const key = await deriveKey(passphrase, salt);
  const ivBytes = new Uint8Array(base64Decode(payload.iv));
  const cipherBytes = new Uint8Array(base64Decode(payload.ciphertext));

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    key,
    cipherBytes.buffer
  );

  return JSON.parse(decoder.decode(decryptedBuffer)) as T;
}
