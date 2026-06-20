"use client";

// Client-side Web Push helpers. Everything degrades to a no-op when push isn't
// configured (no VAPID key), unsupported, or permission is denied — so the
// foreground chime keeps working regardless.

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

async function getSubscription(): Promise<PushSubscriptionJSON | null> {
  if (!VAPID_PUBLIC) return null;
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
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
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
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
 */
export async function schedulePush(opts: {
  endTime: number;
  title: string;
  body: string;
  url?: string;
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
        url: opts.url ?? "/focus",
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
