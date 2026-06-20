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

export function notify(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  try {
    if (Notification.permission === "granted") {
      new Notification(title, { body, silent: true });
    }
  } catch {
    // Ignore — notifications are a nice-to-have, never critical.
  }
}
