// Small wrapper around the Web Notifications API so components never touch the
// browser global directly. All calls are no-ops during SSR.

export function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  try {
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  } catch {
    // Some browsers throw on the sync form — safe to ignore.
  }
}

type NotifyOptions = {
  /** Keep the notification on screen until the user dismisses it. */
  requireInteraction?: boolean;
  /** Let the OS play its notification sound (default true). */
  sound?: boolean;
  /** Vibrate pattern (mobile). */
  vibrate?: number[];
  /** Collapse repeated notifications under one tag. */
  tag?: string;
};

export function notify(title: string, body: string, opts: NotifyOptions = {}) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  try {
    if (Notification.permission === "granted") {
      new Notification(title, {
        body,
        silent: opts.sound === false,
        requireInteraction: opts.requireInteraction ?? false,
        tag: opts.tag,
        ...(opts.vibrate ? { vibrate: opts.vibrate } : {}),
      } as NotificationOptions);
    }
  } catch {
    // Ignore — notifications are a nice-to-have, never critical.
  }
}
