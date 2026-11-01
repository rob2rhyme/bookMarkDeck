import { describe, expect, it } from "vitest";

import { isGoogleSnapshot, reconcile, type Remote } from "@/features/focus/lib/googleReconcile";
import type { Todo } from "@/features/focus/lib/types";

const T1 = "2026-10-23T14:00:00.000Z";
const T2 = "2026-10-24T09:30:00.000Z";
const T3 = "2026-10-25T18:00:00.000Z";

const todo = (over: Partial<Todo> = {}): Todo => ({
  id: "t",
  text: "Call mum",
  note: "",
  done: false,
  dueAt: T1,
  createdAt: null,
  day: "2026-10-20",
  googleTaskId: "gt",
  googleEventId: "ge",
  gsync: { dueAt: T1, done: false },
  ...over,
});

const remote = (over: Partial<Remote> = {}): Remote => ({
  task: { state: "ok", completed: false },
  event: { state: "ok", start: T1 },
  ...over,
});

describe("reconcile — completed in Google Tasks", () => {
  it("completes the open to-do", () => {
    const p = reconcile(todo(), remote({ task: { state: "ok", completed: true } }));
    expect(p).toMatchObject({ complete: true, gsync: { done: true } });
  });

  it("completes a to-do mirrored before snapshots existed", () => {
    const p = reconcile(todo({ gsync: undefined }), remote({ task: { state: "ok", completed: true } }));
    expect(p?.complete).toBe(true);
  });

  it("does not complete when we last told Google it was done and have since reopened it", () => {
    const p = reconcile(
      todo({ gsync: { dueAt: T1, done: true } }),
      remote({ task: { state: "ok", completed: true } })
    );
    expect(p).toBeNull();
  });

  it("leaves a to-do alone that is already done here", () => {
    expect(reconcile(todo({ done: true }), remote({ task: { state: "ok", completed: true } }))).toBeNull();
  });

  it("ignores a Task reopened in Google — it would resurrect finished work", () => {
    expect(reconcile(todo({ gsync: { dueAt: T1, done: true }, done: true }), remote())).toBeNull();
  });
});

describe("reconcile — moved in Google Calendar", () => {
  it("adopts Google's time when only Google changed it", () => {
    const p = reconcile(todo(), remote({ event: { state: "ok", start: T2 } }));
    expect(p).toMatchObject({ dueAt: T2, gsync: { dueAt: T2 } });
  });

  it("keeps a local edit that hasn't been pushed yet", () => {
    // Moved here to T3 (not yet mirrored); Google still has T1 = the snapshot.
    expect(reconcile(todo({ dueAt: T3 }), remote({ event: { state: "ok", start: T1 } }))).toBeNull();
  });

  it("keeps the local time when both sides changed", () => {
    expect(reconcile(todo({ dueAt: T3 }), remote({ event: { state: "ok", start: T2 } }))).toBeNull();
  });

  it("does nothing when the times agree, whatever the string format", () => {
    expect(reconcile(todo(), remote({ event: { state: "ok", start: "2026-10-23T10:00:00-04:00" } }))).toBeNull();
  });

  it("only records a baseline the first time it sees a to-do, without adopting", () => {
    const p = reconcile(todo({ gsync: undefined }), remote({ event: { state: "ok", start: T2 } }));
    expect(p?.dueAt).toBeUndefined();
    expect(p?.gsync).toEqual({ dueAt: T1, done: false });
  });

  it("ignores an all-day event (no time to adopt)", () => {
    expect(reconcile(todo(), remote({ event: { state: "ok", start: null } }))).toBeNull();
  });
});

describe("reconcile — deleted in Google", () => {
  it("unlinks a deleted Task and a deleted event, keeping the to-do", () => {
    const p = reconcile(todo(), {
      task: { state: "gone", completed: false },
      event: { state: "gone", start: null },
    });
    expect(p).toMatchObject({ unlinkTask: true, unlinkEvent: true });
    expect(p?.complete).toBeUndefined();
  });

  it("does nothing on a transient error from Google", () => {
    expect(
      reconcile(todo(), {
        task: { state: "error", completed: false },
        event: { state: "error", start: null },
      })
    ).toBeNull();
  });

  it("does not unlink an id the to-do no longer has", () => {
    expect(reconcile(todo({ googleTaskId: null }), remote({ task: { state: "gone", completed: false } }))).toBeNull();
  });
});

describe("isGoogleSnapshot", () => {
  it("accepts the stored shape and refuses junk", () => {
    expect(isGoogleSnapshot({ dueAt: null, done: false })).toBe(true);
    expect(isGoogleSnapshot({ dueAt: T1, done: true })).toBe(true);
    for (const bad of [null, "x", {}, { dueAt: 5, done: true }, { dueAt: null }]) {
      expect(isGoogleSnapshot(bad)).toBe(false);
    }
  });
});
