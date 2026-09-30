"use client";

// Which ids the cloud held the last time this device synced a data type — so a
// record the cloud now lacks can be told apart:
//
//   • NEW HERE — the cloud never had it (made on this device, offline or before
//     sync was set up). Upload it.
//   • DELETED ELSEWHERE — the cloud had it at the last sync and doesn't now.
//     Another device removed it; bringing it back would undo that delete for
//     everyone.
//
// Uploading "everything the cloud lacks" treated both as new, which is how a
// stale laptop kept resurrecting deletions. Focus's fix (an upsert-only queue,
// 1e4dc90) doesn't transfer to pillars that support never-synced accounts: with
// an empty queue their first connect would upload nothing and the snapshot
// would replace every record. Here a device that has never synced has an empty
// record, so everything local is new and uploads — the old first-connect
// behaviour exactly — and the protection starts from the first sync.
//
// `scope` is the owner key (email/userId); `domain` namespaces the record per
// data type, as in pendingDeletes.ts.

import { pendingUpsertIds } from "@/utils/pendingDeletes";

function key(domain: string, scope?: string | null): string {
  return `bookmarkdeck:synced-ids:${domain}:${scope ?? ""}`;
}

/** The ids the cloud held at this device's last sync of `domain`. */
export function syncedIds(domain: string, scope?: string | null): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key(domain, scope));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** Remember what the cloud holds now — call after every successful pull, push or snapshot. */
export function recordSyncedIds(
  domain: string,
  scope: string | null | undefined,
  ids: Iterable<string>
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(domain, scope), JSON.stringify([...new Set(ids)]));
  } catch {
    /* quota — the worst case is the old behaviour, never data loss */
  }
}

/**
 * The local records the cloud lacks that it NEVER had — the only ones to upload
 * or keep. Anything else the cloud lacks was deleted on another device.
 */
export function newHere<T extends { id: string }>(
  local: T[],
  cloudIds: Set<string>,
  domain: string,
  scope?: string | null
): T[] {
  const known = syncedIds(domain, scope);
  return local.filter((r) => !cloudIds.has(r.id) && !known.has(r.id));
}

/**
 * What to upload on connect: records the cloud never had, plus records edited
 * while disconnected (`queueUpsert`) that the cloud still holds — without the
 * second half, the first snapshot silently reverted every offline edit. A queued
 * record the cloud has since lost was deleted on another device, and that
 * delete wins.
 */
export function toUpload<T extends { id: string }>(
  local: T[],
  cloudIds: Set<string>,
  domain: string,
  scope?: string | null
): T[] {
  const known = syncedIds(domain, scope);
  const edited = pendingUpsertIds(domain, scope);
  return local.filter((r) =>
    cloudIds.has(r.id) ? edited.has(r.id) : !known.has(r.id)
  );
}
