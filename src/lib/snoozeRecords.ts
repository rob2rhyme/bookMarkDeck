// Snoozed reminders, as the service worker leaves them (public/sw.js `snooze`).
//
// Tapping "Snooze 1 hour" on a reminder queues the push again from the worker,
// where there is no localStorage and no page. The worker records what it queued
// in Cache Storage — which the page can read too — so the page can cancel a
// snoozed push the moment its habit is done instead of nagging about it anyway.

/** The same names as public/sw.js; serviceWorker.test.ts holds the two together. */
export const SNOOZE_CACHE = "bmd-snooze-v1";
const PREFIX = "/__snooze/";

export type SnoozeRecord = { tag: string; messageId: string; fireAt: number };

const available = () => typeof caches !== "undefined";

export async function readSnoozes(): Promise<SnoozeRecord[]> {
  if (!available()) return [];
  try {
    const cache = await caches.open(SNOOZE_CACHE);
    const out: SnoozeRecord[] = [];
    for (const req of await cache.keys()) {
      if (!new URL(req.url).pathname.startsWith(PREFIX)) continue;
      const res = await cache.match(req);
      const r = (await res?.json().catch(() => null)) as Partial<SnoozeRecord> | null;
      if (r && typeof r.tag === "string" && typeof r.messageId === "string" && typeof r.fireAt === "number") {
        out.push({ tag: r.tag, messageId: r.messageId, fireAt: r.fireAt });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function clearSnooze(tag: string): Promise<void> {
  if (!available()) return;
  try {
    const cache = await caches.open(SNOOZE_CACHE);
    await cache.delete(PREFIX + encodeURIComponent(tag));
  } catch {
    /* best-effort */
  }
}
