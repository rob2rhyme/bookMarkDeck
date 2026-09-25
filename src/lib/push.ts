"use client";

// Client-side Web Push helpers — the typed client for the /api/push/* routes.
//
// SHARED, not per-feature. These routes are already shared infrastructure (see
// CLAUDE.md), so their client is too, and it lives beside firebase.ts and
// rateLimit.ts rather than inside a pillar. It replaces two identical copies in
// features/focus and features/filing whose only divergence was the default
// click-through below — and whose drift once shipped a live bug (#297: filing's
// copy grew pushSupported(), focus's did not, and habits imports focus's, so a
// "Turn on reminders" control was offered on a deployment with no VAPID key).
//
// Note this is NOT the argument for merging features/{inventory,filing}/lib/r2.ts.
// Those stay copied on purpose: baking the prefix into isOwnedFilingPath makes it
// structurally incapable of authorising an inventory object, which a shared
// isOwnedPath(path, seg, prefix) would downgrade to a runtime argument.
//
// Everything degrades to a no-op when push isn't configured (no VAPID key),
// unsupported, or permission is denied — so the foreground chime keeps working
// regardless.

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Whether push could work at all — the VAPID key this deployment may not have,
 * plus the browser APIs. Callers use it to say so rather than offer a control
 * that silently does nothing: scheduling without it is a no-op, and asking for
 * notification permission to reach that no-op costs the user a prompt for
 * nothing.
 */
export function pushSupported(): boolean {
  return (
    Boolean(VAPID_PUBLIC) &&
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function getSubscription(): Promise<PushSubscriptionJSON | null> {
  if (!pushSupported()) return null;
  try {
    if (Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return null;
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC as string),
      });
    }
    return sub.toJSON();
  } catch {
    return null;
  }
}

/**
 * Schedule a server-fired push at `endTime`. Returns a message id used to
 * cancel it, or null if push isn't available.
 *
 * `url` is REQUIRED: the per-pillar copies each defaulted it to their own route,
 * and a shared default would silently send one pillar's notification to
 * another's page. Every caller states its own destination.
 */
export async function schedulePush(opts: {
  endTime: number;
  title: string;
  body: string;
  url: string;
}): Promise<string | null> {
  const subscription = await getSubscription();
  if (!subscription) return null;
  const delaySec = Math.max(0, Math.round((opts.endTime - Date.now()) / 1000));
  try {
    const res = await fetch("/api/push/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subscription,
        delaySec,
        title: opts.title,
        body: opts.body,
        url: opts.url,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.messageId === "string" ? data.messageId : null;
  } catch {
    return null;
  }
}

export async function cancelPush(messageId: string | null): Promise<void> {
  if (!messageId) return;
  try {
    await fetch("/api/push/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
  } catch {
    // best-effort
  }
}
