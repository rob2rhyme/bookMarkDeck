import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", () => ({
  onSnapshot: vi.fn(() => () => {}),
}));

import { onSnapshot } from "firebase/firestore";
import { onConfirmedSnapshot, onSnapshotWithMeta } from "@/lib/firestoreSnapshot";

type Snap = { docs: { id: string }[]; metadata: { fromCache: boolean; hasPendingWrites: boolean } };
const snap = (fromCache: boolean, hasPendingWrites = false, docs: { id: string }[] = []): Snap => ({
  docs,
  metadata: { fromCache, hasPendingWrites },
});

/** Subscribe, wait for the listener to attach, and hand back its snapshot feed. */
async function attach(subscribe: (ref: unknown, cb: (s: Snap) => void, onErr: (e: unknown) => void) => void) {
  const cb = vi.fn();
  const onError = vi.fn();
  subscribe({}, cb, onError);
  await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalled());
  const call = vi.mocked(onSnapshot).mock.calls[0] as unknown as [
    unknown,
    { includeMetadataChanges: boolean },
    (s: Snap) => void,
    (e: unknown) => void,
  ];
  return { cb, onError, options: call[1], feed: call[2], attachedOnError: call[3] };
}

beforeEach(() => vi.mocked(onSnapshot).mockClear());

describe("onSnapshotWithMeta", () => {
  it("always requests metadata changes and passes every snapshot through", async () => {
    const { cb, options, feed } = await attach((ref, cb, onErr) =>
      onSnapshotWithMeta(ref as never, cb, onErr)
    );
    expect(options.includeMetadataChanges).toBe(true);
    const a = snap(true);
    feed(a);
    expect(cb).toHaveBeenCalledWith(a, { fromCache: true, hasPendingWrites: false });
    const b = snap(false, true);
    feed(b);
    expect(cb).toHaveBeenCalledWith(b, { fromCache: false, hasPendingWrites: true });
  });

  it("forwards the onError callback", async () => {
    const { attachedOnError, onError } = await attach((ref, cb, onErr) =>
      onSnapshotWithMeta(ref as never, cb, onErr)
    );
    const err = new Error("boom");
    attachedOnError(err);
    expect(onError).toHaveBeenCalledWith(err);
  });
});

describe("onConfirmedSnapshot", () => {
  it("holds cache-only answers back until the server has answered", async () => {
    const { cb, feed } = await attach((ref, cb, onErr) => onConfirmedSnapshot(ref as never, cb, onErr));
    feed(snap(true));
    feed(snap(true));
    expect(cb).not.toHaveBeenCalled();
    const confirmed = snap(false);
    feed(confirmed);
    expect(cb).toHaveBeenCalledExactlyOnceWith(confirmed, { fromCache: false, hasPendingWrites: false });
  });

  it("passes a later cache-only blip through once confirmed", async () => {
    const { cb, feed } = await attach((ref, cb, onErr) => onConfirmedSnapshot(ref as never, cb, onErr));
    feed(snap(false)); // confirmed
    const blip = snap(true);
    feed(blip);
    expect(cb).toHaveBeenLastCalledWith(blip, { fromCache: true, hasPendingWrites: false });
  });

  it("passes a later pending-write snapshot through normally", async () => {
    const { cb, feed } = await attach((ref, cb, onErr) => onConfirmedSnapshot(ref as never, cb, onErr));
    feed(snap(false)); // confirmed
    const pending = snap(false, true);
    feed(pending);
    expect(cb).toHaveBeenLastCalledWith(pending, { fromCache: false, hasPendingWrites: true });
  });

  it("never calls back on an empty cache-only snapshot, only the real answer", async () => {
    const { cb, feed } = await attach((ref, cb, onErr) => onConfirmedSnapshot(ref as never, cb, onErr));
    feed(snap(true, false, [])); // cache-only, happens to read empty
    expect(cb).not.toHaveBeenCalled();
    const real = snap(false, false, [{ id: "1" }]);
    feed(real);
    expect(cb).toHaveBeenCalledExactlyOnceWith(real, { fromCache: false, hasPendingWrites: false });
  });
});
