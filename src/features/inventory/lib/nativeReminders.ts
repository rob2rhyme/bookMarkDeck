"use client";

// Hands the on-device reminder plan (localReminders.ts) to the native app shell via
// the official local-notifications plugin. Everything here is a no-op on the plain
// web/PWA, where Capacitor isn't present — same shape as the Focus timer's
// nativeNotify.ts. The shell loads the live site, so this web code reaches a device
// before a rebuilt app carries the plugin: every call is guarded and quiet, and the
// app works as before until the native side catches up (CAPACITOR_IOS.md).

import type { LocalReminder } from "@/features/inventory/lib/localReminders";

type Plugin = typeof import("@capacitor/local-notifications").LocalNotifications;

let pluginPromise: Promise<Plugin | null> | null = null;

function loadPlugin(): Promise<Plugin | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!pluginPromise) {
    pluginPromise = (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return null;
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        return LocalNotifications;
      } catch {
        return null;
      }
    })();
  }
  return pluginPromise;
}

/** Test seam: forget what was loaded. */
export function resetNativeRemindersForTests() {
  pluginPromise = null;
}

/** Is this the native app, with the plugin available? */
export async function nativeRemindersAvailable(): Promise<boolean> {
  return (await loadPlugin()) !== null;
}

/** Ask the system for permission — call from a click, never on page load. */
export async function requestNativeReminderPermission(): Promise<boolean> {
  const p = await loadPlugin();
  if (!p) return false;
  try {
    const now = await p.checkPermissions();
    if (now.display === "granted") return true;
    if (now.display === "denied") return false;
    return (await p.requestPermissions()).display === "granted";
  } catch {
    return false;
  }
}

/**
 * Make the device's pending reminders exactly `plan`: cancel the ones we scheduled
 * last time (by id — never anything else the app has pending, like the timer's
 * alert), then schedule the new set. Returns the ids now scheduled, to be passed
 * back next time. With no permission it schedules nothing and returns [].
 */
export async function syncNativeReminders(plan: LocalReminder[], previousIds: number[]): Promise<number[]> {
  const p = await loadPlugin();
  if (!p) return previousIds;
  try {
    if (previousIds.length) await p.cancel({ notifications: previousIds.map((id) => ({ id })) });
    if (plan.length === 0) return [];
    if ((await p.checkPermissions()).display !== "granted") return [];
    await p.schedule({
      notifications: plan.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        schedule: { at: new Date(r.at), allowWhileIdle: true },
      })),
    });
    return plan.map((r) => r.id);
  } catch {
    // Scheduling failed (the native side may not carry the plugin yet): nothing is
    // pending that we know of, and the next change tries again.
    return [];
  }
}
