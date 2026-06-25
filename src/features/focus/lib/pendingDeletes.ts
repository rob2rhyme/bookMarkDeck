"use client";

// Records ids whose cloud delete couldn't run yet (the user wasn't connected at
// delete time) so the deletion is REPLAYED on the next connect. Without this, a
// live Firestore snapshot re-adds items the user already deleted locally — and
// "absent locally" can't be treated as "delete" (a fresh device has empty local
// state and would wipe the cloud). Only ids the user explicitly deleted are
// queued, so replay is always safe.

function keyFor(domain: string, email?: string | null): string {
  return `bookmarkdeck:focus:pending-del:${domain}:${email ?? ""}`;
}

function read(domain: string, email?: string | null): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(domain, email));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function write(domain: string, email: string | null | undefined, ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(domain, email), JSON.stringify(ids));
  } catch {}
}

/** Remember an id to delete from the cloud once a connection exists. */
export function queueDelete(domain: string, email: string | null | undefined, id: string): void {
  const ids = read(domain, email);
  if (!ids.includes(id)) write(domain, email, [...ids, id]);
}

/** Drop an id from the queue (e.g. it was restored/re-created before the flush). */
export function unqueueDelete(domain: string, email: string | null | undefined, id: string): void {
  const ids = read(domain, email);
  if (ids.includes(id)) write(domain, email, ids.filter((x) => x !== id));
}

/** Replay all queued deletions, then clear the queue. */
export async function flushPendingDeletes(
  domain: string,
  email: string | null | undefined,
  del: (id: string) => Promise<void>
): Promise<void> {
  const ids = read(domain, email);
  if (ids.length === 0) return;
  await Promise.all(ids.map((id) => del(id).catch(() => {})));
  write(domain, email, []);
}
