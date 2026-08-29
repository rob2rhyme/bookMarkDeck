"use client";

// Client-side Web Push helpers for Filing.
//
// COPIED from features/focus/lib/push.ts rather than imported. A feature must
// never import another feature — that is the coupling MYSTUFF-DECOUPLING-
// READINESS.md records as blocking a clean extraction, and the reason
// InventoryLocation exists beside src/types/folder.ts instead of sharing it.
// The ~60 duplicated lines are the price of `rm -rf src/features/filing`
// staying a complete removal.
//
// The API routes under /api/push are shared infrastructure, not feature code,
// so calling them is fine.
//
// Everything degrades to a no-op when push isn't configured (no VAPID key),
// unsupported, or permission is denied.

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
 * Whether push could work at all — used to hide the setting rather than offer a
 * toggle that silently does nothing.
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

/** Schedule a server-fired push. Returns a cancellable id, or null. */
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
        url: opts.url ?? "/filing",
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
    /* best-effort */
  }
}
