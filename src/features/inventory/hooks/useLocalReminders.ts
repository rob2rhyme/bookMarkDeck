"use client";

// Keep the device's on-device reminders (localReminders.ts) in step with My Stuff.
// Native app only, opt-in, and per device: a notification belongs to the phone it
// is scheduled on, so the choice is a local flag, not a synced setting.

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import type { InventoryItem } from "@/features/inventory/lib/types";
import { fingerprint, planLocalReminders } from "@/features/inventory/lib/localReminders";
import { nativeRemindersAvailable, syncNativeReminders } from "@/features/inventory/lib/nativeReminders";

const FLAG_KEY = "bd:inventory:local-reminders:v1";
const IDS_KEY = "bd:inventory:local-reminder-ids:v1";
const CHANGED = "bd:inventory-local-reminders-changed";

const flagKey = (email?: string | null) => `${FLAG_KEY}:${email ?? ""}`;
const idsKey = (email?: string | null) => `${IDS_KEY}:${email ?? ""}`;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
function readIds(email?: string | null): number[] {
  try {
    const parsed: unknown = JSON.parse(read(idsKey(email)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((n): n is number => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(CHANGED, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGED, cb);
    window.removeEventListener("storage", cb);
  };
}

/** The per-device on/off choice. Off until asked for. */
export function useLocalReminderSetting(email?: string | null): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    subscribe,
    () => read(flagKey(email)) === "1",
    () => false
  );
  const set = useCallback(
    (next: boolean) => {
      write(flagKey(email), next ? "1" : null);
      window.dispatchEvent(new Event(CHANGED));
    },
    [email]
  );
  return [on, set];
}

/**
 * When enabled (and in the native app) the device holds exactly the reminders the
 * plan says; when disabled, whatever we scheduled is cancelled. The plan is
 * fingerprinted so an unchanged dashboard doesn't re-schedule on every render.
 */
export function useLocalReminders({
  email,
  enabled,
  items,
  today,
  nameItems,
  ready,
}: {
  email?: string | null;
  enabled: boolean;
  items: InventoryItem[];
  today: string;
  /** False when My Stuff is PIN-locked: no names in notifications. */
  nameItems: boolean;
  ready: boolean;
}) {
  const last = useRef<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    if (!ready) return;
    const plan = enabled ? planLocalReminders(items, today, Date.now(), nameItems) : [];
    const fp = `${enabled}|${fingerprint(plan)}`;
    if (fp === last.current) return;
    last.current = fp;
    // One sync at a time, in order, so two quick changes can't interleave a cancel
    // of the newer set with the scheduling of the older one.
    queue.current = queue.current.then(async () => {
      if (!(await nativeRemindersAvailable())) return;
      const ids = await syncNativeReminders(plan, readIds(email));
      write(idsKey(email), ids.length ? JSON.stringify(ids) : null);
    });
  }, [email, enabled, items, today, nameItems, ready]);
}
