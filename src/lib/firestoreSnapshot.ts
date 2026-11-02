// Shared metadata-aware wrapper around Firestore's onSnapshot, generalizing
// focusData.ts's subscribeHydration/subscribeHydrationHistory `serverFirst`
// guard (PR #348) beyond hydration's single-document case.
//
// Every live listener here fires at once from the SDK's optimistic local
// cache before the server has actually answered — with metadata changes on,
// that first fire (and any later cache-only one) carries
// `snapshot.metadata.fromCache: true`. A callback that treats it as the
// cloud's confirmed state can be wrong twice over: `recordSyncedIdsUnlessPending`
// (@/utils/syncedIds) guards against recording an item created by this page's
// own unacknowledged write as "the cloud already has this" (data loss on
// reconnect); `onConfirmedSnapshot` guards against a hook wholesale-replacing
// its state from a cache-only answer that happens to read empty, wiping what
// it had until the real server answer arrives.

import { onSnapshot, type DocumentData, type QuerySnapshot } from "firebase/firestore";
import type { Query } from "firebase/firestore";

export type SnapshotMeta = { fromCache: boolean; hasPendingWrites: boolean };
type Unsub = () => void;

/**
 * onSnapshot with `{includeMetadataChanges: true}`, handing the callback the
 * snapshot's metadata alongside the snapshot itself. Every snapshot still
 * passes through unchanged — this is inert plumbing on its own, safe even for
 * a caller that doesn't use `docChanges()` (none of this app's listeners do),
 * since a metadata-only re-fire just repeats the same docs.
 */
export function onSnapshotWithMeta(
  ref: Query<DocumentData>,
  cb: (snap: QuerySnapshot<DocumentData>, meta: SnapshotMeta) => void,
  onError: (err: unknown) => void
): Unsub {
  return onSnapshot(
    ref,
    { includeMetadataChanges: true },
    (snap) =>
      cb(snap, { fromCache: snap.metadata.fromCache, hasPendingWrites: snap.metadata.hasPendingWrites }),
    onError
  );
}

/**
 * onSnapshotWithMeta, but swallows every cache-only snapshot before the first
 * server-confirmed one. Once confirmed, every snapshot after passes through
 * unchanged — including this page's own later pending writes, which a hook
 * replacing its state wholesale (`setX(cloud)`) legitimately wants to see.
 * Does not decide replace-vs-union; that stays the caller's call (see
 * useVaults.ts, which unions instead of replacing for its delete-never
 * collection).
 */
export function onConfirmedSnapshot(
  ref: Query<DocumentData>,
  cb: (snap: QuerySnapshot<DocumentData>, meta: SnapshotMeta) => void,
  onError: (err: unknown) => void
): Unsub {
  let confirmed = false;
  return onSnapshotWithMeta(
    ref,
    (snap, meta) => {
      if (!confirmed) {
        if (meta.fromCache) return;
        confirmed = true;
      }
      cb(snap, meta);
    },
    onError
  );
}
