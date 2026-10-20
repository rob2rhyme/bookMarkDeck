"use client";

// The unlocked state of the notes vault, for this tab only. Keys live in memory
// — never in localStorage, never synced — so a reload, a closed tab or the idle
// timeout locks everything again. Keys are non-extractable CryptoKeys: code can
// use them while unlocked but can't read their bytes out.

import { useSyncExternalStore } from "react";

export const IDLE_LOCK_MS = 10 * 60_000;

const keys = new Map<string, CryptoKey>();
const listeners = new Set<() => void>();
const beforeLock = new Set<() => Promise<void> | void>();
let idle: ReturnType<typeof setTimeout> | null = null;

const emit = () => listeners.forEach((l) => l());

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const isUnlocked = () => keys.size > 0;
export const keyFor = (kid: string): CryptoKey | undefined => keys.get(kid);
export const unlockedKids = (): string[] => [...keys.keys()];

/** Any activity in an unlocked note pushes the idle lock back. */
export function touch(): void {
  if (idle) clearTimeout(idle);
  idle = keys.size ? setTimeout(() => void lock(), IDLE_LOCK_MS) : null;
}

export function addKeys(entries: [kid: string, key: CryptoKey][]): void {
  for (const [kid, key] of entries) keys.set(kid, key);
  touch();
  emit();
}

/**
 * Run before the keys are dropped — an open editor uses it to save its pending
 * typing, encrypted, while it still can. Returns an unsubscribe.
 */
export function onBeforeLock(fn: () => Promise<void> | void): () => void {
  beforeLock.add(fn);
  return () => beforeLock.delete(fn);
}

export async function lock(): Promise<void> {
  if (!keys.size) return;
  await Promise.allSettled([...beforeLock].map((fn) => fn()));
  keys.clear();
  if (idle) clearTimeout(idle);
  idle = null;
  emit();
}

/** Re-renders when the vault locks or unlocks. Server render: locked. */
export function useVaultUnlocked(): boolean {
  return useSyncExternalStore(subscribe, isUnlocked, () => false);
}

/** Tests only: start from a locked, listener-free state. */
export function resetVaultSessionForTests(): void {
  keys.clear();
  beforeLock.clear();
  if (idle) clearTimeout(idle);
  idle = null;
  emit();
}
