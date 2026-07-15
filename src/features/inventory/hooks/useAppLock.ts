"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  isAppLockConfig,
  makePinConfig,
  verifyPin,
  type AppLockConfig,
} from "@/features/inventory/lib/appLock";

const BASE_KEY = "bookmarkdeck:inventory:lock:v1";
const keyFor = (email?: string | null) => (email ? `${BASE_KEY}:${email}` : BASE_KEY);

// ── WebAuthn (platform authenticator) — a biometric *presence* gate. There's no
// server to verify the assertion, so this proves "the device authenticator did
// user-verification", which is exactly what a local privacy screen needs. ──────
function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// Allocate on a plain ArrayBuffer so these satisfy WebAuthn's BufferSource
// (TS's typed-array generics reject the default ArrayBufferLike backing).
function bytes(n: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new ArrayBuffer(n));
}
function b64urlToBuf(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = bytes(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function randomChallenge(): Uint8Array<ArrayBuffer> {
  const a = bytes(32);
  crypto.getRandomValues(a);
  return a;
}
function textBytes(s: string, max: number): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder().encode(s);
  const out = bytes(Math.min(enc.length, max));
  out.set(enc.subarray(0, out.length));
  return out;
}

async function platformAuthenticatorAvailable(): Promise<boolean> {
  try {
    return Boolean(
      typeof window !== "undefined" &&
        window.PublicKeyCredential &&
        (await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

async function enrollBiometric(email: string): Promise<string | null> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: "Bookmark Deck", id: window.location.hostname },
        user: {
          id: textBytes(email, 64),
          name: email,
          displayName: email,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    return cred ? bufToB64url(cred.rawId) : null;
  } catch {
    return null;
  }
}

async function assertBiometric(credentialId: string): Promise<boolean> {
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        allowCredentials: [{ type: "public-key", id: b64urlToBuf(credentialId) }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    return assertion !== null;
  } catch {
    return false;
  }
}

/**
 * The My Stuff privacy lock. Local-only (per-user localStorage, never synced —
 * a lock is device-bound by nature and a PIN hash has no business in the cloud).
 * Hydration-safe: unlocked on first render, then the mount effect re-locks if a
 * lock is configured — so it re-locks on load and whenever you navigate back to
 * My Stuff, plus a manual "Lock now". Honest by design: a convenience screen,
 * not a vault. (No auto-lock on tab-hide in v1 — it would fire during the
 * camera/file picker and clobber an in-progress form.)
 */
export function useAppLock(email: string | null | undefined) {
  const [config, setConfig] = useState<AppLockConfig | null>(null);
  const [locked, setLocked] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const configRef = useRef<AppLockConfig | null>(null);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Load config for this user; lock immediately if one exists.
  useEffect(() => {
    let parsed: AppLockConfig | null = null;
    try {
      const raw = window.localStorage.getItem(keyFor(email));
      const v = raw ? JSON.parse(raw) : null;
      if (isAppLockConfig(v)) parsed = v;
    } catch {
      /* ignore */
    }
    setConfig(parsed);
    setLocked(Boolean(parsed));
    setHydrated(true);
    void platformAuthenticatorAvailable().then(setBiometricAvailable);
  }, [email]);

  const persist = useCallback(
    (next: AppLockConfig | null) => {
      setConfig(next);
      try {
        if (next) window.localStorage.setItem(keyFor(email), JSON.stringify(next));
        else window.localStorage.removeItem(keyFor(email));
      } catch {
        /* ignore */
      }
    },
    [email]
  );

  const enablePin = useCallback(
    async (pin: string): Promise<boolean> => {
      const next = await makePinConfig(pin);
      // Carry an existing biometric enrolment across a PIN change.
      if (configRef.current?.biometricId) next.biometricId = configRef.current.biometricId;
      persist(next);
      setLocked(false);
      return true;
    },
    [persist]
  );

  const unlockWithPin = useCallback(async (pin: string): Promise<boolean> => {
    const c = configRef.current;
    if (!c) return true;
    const ok = await verifyPin(c, pin);
    if (ok) setLocked(false);
    return ok;
  }, []);

  const unlockWithBiometric = useCallback(async (): Promise<boolean> => {
    const c = configRef.current;
    if (!c?.biometricId) return false;
    const ok = await assertBiometric(c.biometricId);
    if (ok) setLocked(false);
    return ok;
  }, []);

  const addBiometric = useCallback(async (): Promise<boolean> => {
    if (!email) return false;
    const c = configRef.current;
    if (!c) return false;
    const id = await enrollBiometric(email);
    if (!id) return false;
    persist({ ...c, biometricId: id });
    return true;
  }, [email, persist]);

  const removeBiometric = useCallback(() => {
    const c = configRef.current;
    if (!c) return;
    const { biometricId: _drop, ...rest } = c;
    persist(rest);
  }, [persist]);

  const disable = useCallback(() => {
    persist(null);
    setLocked(false);
  }, [persist]);

  const lockNow = useCallback(() => {
    if (configRef.current) setLocked(true);
  }, []);

  return {
    hydrated,
    enabled: Boolean(config),
    locked: hydrated && locked && Boolean(config),
    hasBiometric: Boolean(config?.biometricId),
    biometricAvailable,
    enablePin,
    unlockWithPin,
    unlockWithBiometric,
    addBiometric,
    removeBiometric,
    disable,
    lockNow,
    // Recovery escape hatch on the unlock gate = the same "turn it off and
    // reveal" as disable; the gate's copy makes the reveal explicit.
    resetLock: disable,
  };
}
