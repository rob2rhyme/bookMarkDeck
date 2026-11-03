"use client";

// Records ids whose cloud write couldn't run yet (the user wasn't connected at
// the time) so the change is REPLAYED on the next connect/sync. Two queues per
// data type:
//
//   • pending DELETES — ids the user removed offline. Without replay, a live
//     snapshot or a sync-from-cloud re-adds them (and "absent locally" can't be
//     treated as "delete" — a fresh device has empty local state and would wipe
//     the cloud).
//   • pending UPSERTS — ids the user added/edited offline. Without replay, those
//     changes never reach the cloud. Critically, this lets connect push ONLY
//     what actually changed offline instead of blindly re-uploading the whole
//     local cache (which clobbers newer cloud edits and resurrects items deleted
//     on another device).
//
// `scope` is the owner key (email/userId); `domain` namespaces the queue per
// data type (e.g. "todos", "notes", "tasks", "moods", "shortcuts"). A domain
// belongs to ONE collection: Focus's journal notes and the Notes pillar once
// shared "notes", and each connect cleared the other's queue.

function delKey(domain: string, scope?: string | null): string {
  return `bookmarkdeck:pending-del:${domain}:${scope ?? ""}`;
}
function upKey(domain: string, scope?: string | null): string {
  return `bookmarkdeck:pending-up:${domain}:${scope ?? ""}`;
}

function readKey(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function writeKey(key: string, ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {}
}

function add(key: string, id: string): void {
  const ids = readKey(key);
  if (!ids.includes(id)) writeKey(key, [...ids, id]);
}
function drop(key: string, id: string): void {
  const ids = readKey(key);
  if (ids.includes(id)) writeKey(key, ids.filter((x) => x !== id));
}

/* ------------------------------------------------------------- deletes --- */

/** Remember an id to delete from the cloud once a connection exists. */
export function queueDelete(domain: string, scope: string | null | undefined, id: string): void {
  add(delKey(domain, scope), id);
}

/** Drop an id from the delete queue (e.g. it was restored before the flush). */
export function unqueueDelete(domain: string, scope: string | null | undefined, id: string): void {
  drop(delKey(domain, scope), id);
}

/** The currently queued delete ids (e.g. to filter them out of a cloud pull). */
export function pendingDeleteIds(domain: string, scope?: string | null): Set<string> {
  return new Set(readKey(delKey(domain, scope)));
}

/** Forget all queued deletions for a domain (after they've been pushed). */
export function clearPendingDeletes(domain: string, scope?: string | null): void {
  writeKey(delKey(domain, scope), []);
}

/** Replay all queued deletions via `del`, then clear the queue. */
export async function flushPendingDeletes(
  domain: string,
  scope: string | null | undefined,
  del: (id: string) => Promise<void>
): Promise<void> {
  const ids = readKey(delKey(domain, scope));
  if (ids.length === 0) return;
  await Promise.all(ids.map((id) => del(id).catch(() => {})));
  writeKey(delKey(domain, scope), []);
}

/* ------------------------------------------------------------- upserts --- */

/** Remember an id added/edited offline, to push to the cloud on next connect. */
export function queueUpsert(domain: string, scope: string | null | undefined, id: string): void {
  add(upKey(domain, scope), id);
}

/** Drop an id from the upsert queue (e.g. it was deleted before the flush). */
export function unqueueUpsert(domain: string, scope: string | null | undefined, id: string): void {
  drop(upKey(domain, scope), id);
}

/** The currently queued upsert ids — push only these, not the whole cache. */
export function pendingUpsertIds(domain: string, scope?: string | null): Set<string> {
  return new Set(readKey(upKey(domain, scope)));
}

/** Forget all queued upserts for a domain (after they've been pushed). */
export function clearPendingUpserts(domain: string, scope?: string | null): void {
  writeKey(upKey(domain, scope), []);
}
