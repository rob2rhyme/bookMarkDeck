// src/utils/crypto.ts
// Small crypto helpers for client-side encryption using Web Crypto (AES-GCM).

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SALT = encoder.encode("bookmarkdeck-drive-sync");

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(passphrase: string) {
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
      salt: SALT,
      iterations: 150_000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptJson<T>(
  passphrase: string,
  data: T
): Promise<{ iv: string; ciphertext: string }> {
  const key = await deriveKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = encoder.encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    iv: base64Encode(iv),
    ciphertext: base64Encode(new Uint8Array(encrypted)),
  };
}

export async function decryptJson<T>(
  passphrase: string,
  payload: { iv: string; ciphertext: string }
): Promise<T> {
  const key = await deriveKey(passphrase);
  const iv = base64Decode(payload.iv);
  const data = base64Decode(payload.ciphertext);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data.buffer);
  return JSON.parse(decoder.decode(decrypted)) as T;
}
