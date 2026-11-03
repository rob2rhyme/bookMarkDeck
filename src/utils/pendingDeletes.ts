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

/**
 * Replay queued deletions via `del`. Each id leaves the queue once its delete
 * lands (or can never land); one that failed is tried again on the next connect.
 */
export async function flushPendingDeletes(
  domain: string,
  scope: string | null | undefined,
  del: (id: string) => Promise<void>
): Promise<void> {
  const key = delKey(domain, scope);
  const ids = readKey(key);
  if (ids.length === 0) return;
  const started = new Map(ids.map((id) => [id, genOf(domain, scope, id)]));
  await Promise.all(
    ids.map(async (id) => {
      if (!(await landed(() => del(id)))) return;
      if (genOf(domain, scope, id) === started.get(id)) drop(key, id);
    })
  );
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

/* ---------------------------------------- queue first, settle on landing --- */
//
// While signed in, a write goes straight to Firestore, which keeps it in this
// tab's memory until the server has it (there is no persistent cache): a tab
// closed offline loses it, and the next load's snapshot puts the old copy back.
// So a write is queued FIRST, signed in or not, and leaves the queue only once
// the server acknowledges it. Whatever is still queued is replayed on the next
// connect. A whole-record write is idempotent, so a replay that repeats one that
// did land is harmless.
//
// Each record carries a generation, so an older write's acknowledgement never
// takes a newer write to the same record off the queue. Generations live in this
// tab's memory: they only need to outlast the writes this tab has in flight.

const generations = new Map<string, number>();
const genKey = (domain: string, scope: string | null | undefined, id: string) =>
  `${domain}:${scope ?? ""}:${id}`;
function genOf(domain: string, scope: string | null | undefined, id: string): number {
  return generations.get(genKey(domain, scope, id)) ?? 0;
}
function bump(domain: string, scope: string | null | undefined, id: string): number {
  const next = genOf(domain, scope, id) + 1;
  generations.set(genKey(domain, scope, id), next);
  return next;
}

/** Refused for good (the rules, a malformed document): retrying can't help. */
export function isPermanentWriteError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "permission-denied" || code === "invalid-argument";
}

/** True once `send` has landed or can never land; false while it may yet. */
async function landed(send: () => Promise<unknown>): Promise<boolean> {
  try {
    await send();
    return true;
  } catch (err) {
    return isPermanentWriteError(err);
  }
}

function durable(
  domain: string,
  scope: string | null | undefined,
  id: string,
  queue: string,
  other: string,
  send: (() => Promise<unknown>) | null
): Promise<void> {
  drop(other, id);
  add(queue, id);
  const gen = bump(domain, scope, id);
  if (!send) return Promise.resolve();
  return send().then(
    () => {
      if (genOf(domain, scope, id) === gen) drop(queue, id);
    },
    (err) => {
      if (isPermanentWriteError(err) && genOf(domain, scope, id) === gen) drop(queue, id);
      throw err;
    }
  );
}

/**
 * Save a record durably: queued now, off the queue once `send` lands. With no
 * `send` (not connected) it is only queued, for the next connect. Rejects with
 * `send`'s error, so a caller can report a save that failed.
 */
export function durableSave(
  domain: string,
  scope: string | null | undefined,
  id: string,
  send: (() => Promise<unknown>) | null
): Promise<void> {
  return durable(domain, scope, id, upKey(domain, scope), delKey(domain, scope), send);
}

/** Delete a record durably — the mirror of `durableSave`. */
export function durableDelete(
  domain: string,
  scope: string | null | undefined,
  id: string,
  send: (() => Promise<unknown>) | null
): Promise<void> {
  return durable(domain, scope, id, delKey(domain, scope), upKey(domain, scope), send);
}

/**
 * On connect: send `records` (what the caller decided to upload — typically
 * `toUpload`), taking each off the upsert queue once it lands; then take off
 * whatever else was queued, which the caller chose not to send (a record deleted
 * on another device). A save that failed stays for the next connect, and a write
 * started while this runs keeps its entry.
 */
export async function replayUpserts<T extends { id: string }>(
  domain: string,
  scope: string | null | undefined,
  records: T[],
  send: (record: T) => Promise<unknown>
): Promise<void> {
  const key = upKey(domain, scope);
  const started = new Map(readKey(key).map((id) => [id, genOf(domain, scope, id)]));
  const settle = (id: string) => {
    const gen = started.get(id);
    if (gen !== undefined && genOf(domain, scope, id) === gen) drop(key, id);
  };
  await Promise.all(
    records.map(async (r) => {
      if (await landed(() => send(r))) settle(r.id);
    })
  );
  const sent = new Set(records.map((r) => r.id));
  for (const id of started.keys()) if (!sent.has(id)) settle(id);
}
