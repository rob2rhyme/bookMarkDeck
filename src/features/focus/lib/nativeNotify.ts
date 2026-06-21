"use client";

// Native (Capacitor) time-sensitive local notification for the timer end.
//
// When the app runs inside the Capacitor iOS shell, the timer schedules a LOCAL
// notification at the block's end time via a small custom `TimerAlert` plugin
// (see CAPACITOR_IOS.md) that sets interruptionLevel = .timeSensitive — so it
// breaks through Focus / Do Not Disturb and buzzes even with the app closed.
//
// Everything here is a no-op on the plain web/PWA (Capacitor not present), where
// the existing Web Push path keeps handling backgrounded alerts. Capacitor is
// dynamically imported so it never touches the server/SSR bundle.

type TimerAlertPlugin = {
  requestPermission(): Promise<{ granted: boolean }>;
  schedule(opts: {
    id: number;
    at: number; // epoch ms
    title: string;
    body: string;
  }): Promise<void>;
  cancel(opts: { id: number }): Promise<void>;
};

// One stable id so a new schedule replaces the previous pending alert.
const FOCUS_ALERT_ID = 7001;

let pluginPromise: Promise<TimerAlertPlugin | null> | null = null;

function loadPlugin(): Promise<TimerAlertPlugin | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!pluginPromise) {
    pluginPromise = (async () => {
      try {
        const { Capacitor, registerPlugin } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return null;
        return registerPlugin<TimerAlertPlugin>("TimerAlert");
      } catch {
        return null;
      }
    })();
  }
  return pluginPromise;
}

export async function ensureNativeNotifPermission(): Promise<void> {
  const p = await loadPlugin();
  if (!p) return;
  try {
    await p.requestPermission();
  } catch {
    /* best-effort */
  }
}

export async function scheduleNativeTimerAlert(
  endTime: number,
  title: string,
  body: string
): Promise<void> {
  const p = await loadPlugin();
  if (!p) return;
  try {
    await p.schedule({ id: FOCUS_ALERT_ID, at: endTime, title, body });
  } catch {
    /* best-effort */
  }
}

export async function cancelNativeTimerAlert(): Promise<void> {
  const p = await loadPlugin();
  if (!p) return;
  try {
    await p.cancel({ id: FOCUS_ALERT_ID });
  } catch {
    /* best-effort */
  }
}
