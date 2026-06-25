"use client";

// Records ids whose cloud delete couldn't run yet (the user wasn't connected at
// delete time) so the deletion is REPLAYED on the next connect/sync. Without
// this, a live snapshot or a sync-from-cloud re-adds items the user already
// deleted locally — and "absent locally" can't be treated as "delete" (a fresh
// device has empty local state and would wipe the cloud). Only ids the user
// explicitly deleted are queued, so replay is always safe.
//
// `scope` is the owner key (email/userId); `domain` namespaces the queue per
// data type (e.g. "todos", "notes", "tasks", "shortcuts").

function keyFor(domain: string, scope?: string | null): string {
  return `bookmarkdeck:pending-del:${domain}:${scope ?? ""}`;
}

function read(domain: string, scope?: string | null): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(domain, scope));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function write(domain: string, scope: string | null | undefined, ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(domain, scope), JSON.stringify(ids));
  } catch {}
}

/** Remember an id to delete from the cloud once a connection exists. */
export function queueDelete(domain: string, scope: string | null | undefined, id: string): void {
  const ids = read(domain, scope);
  if (!ids.includes(id)) write(domain, scope, [...ids, id]);
}

/** Drop an id from the queue (e.g. it was restored/re-created before the flush). */
export function unqueueDelete(domain: string, scope: string | null | undefined, id: string): void {
  const ids = read(domain, scope);
  if (ids.includes(id)) write(domain, scope, ids.filter((x) => x !== id));
}

/** The currently-queued ids (e.g. to filter them out of a cloud pull). */
export function pendingDeleteIds(domain: string, scope?: string | null): Set<string> {
  return new Set(read(domain, scope));
}

/** Forget all queued deletions for a domain (after they've been pushed to cloud). */
export function clearPendingDeletes(domain: string, scope?: string | null): void {
  write(domain, scope, []);
}

/** Replay all queued deletions via `del`, then clear the queue. */
export async function flushPendingDeletes(
  domain: string,
  scope: string | null | undefined,
  del: (id: string) => Promise<void>
): Promise<void> {
  const ids = read(domain, scope);
  if (ids.length === 0) return;
  await Promise.all(ids.map((id) => del(id).catch(() => {})));
  write(domain, scope, []);
}
