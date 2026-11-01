// Two-way sync of a mirrored to-do (Google Tasks + a Calendar event): what to
// adopt from Google, given what Google reports now and what it held when we last
// synced. Pure — see googleReconcile.test.ts.
//
// The to-do is mirrored OUT whenever it changes here (useGoogleTodoSync). This is
// the way back in, and it must never undo a local edit that hasn't been pushed
// yet — a pull that "restored" Google's older time over a fresh edit would lose
// work. So every comparison is three-way, against `gsync`, the state Google had
// when we last pushed or adopted:
//
//   Google differs from gsync, local equals gsync  → Google changed it: adopt.
//   local differs from gsync                       → we changed it: leave it, the
//                                                    next mirror will push it.
//   both changed                                   → local wins, same reason.

import type { GoogleSnapshot, Todo } from "@/features/focus/lib/types";

export type RemoteTask = { state: "ok" | "gone" | "error"; completed: boolean };
export type RemoteEvent = { state: "ok" | "gone" | "error"; start: string | null };
export type Remote = { task: RemoteTask | null; event: RemoteEvent | null };

export type GooglePatch = {
  /** Mark it done here (Google Tasks says it is). */
  complete?: boolean;
  /** Google moved the calendar event: take its time. */
  dueAt?: string;
  /** Deleted on Google's side: stop pointing at it. */
  unlinkTask?: boolean;
  unlinkEvent?: boolean;
  /** The snapshot to store once the patch is applied. */
  gsync?: GoogleSnapshot;
};

/** A stored snapshot, or junk from a hand-edited doc / old cache. */
export function isGoogleSnapshot(v: unknown): v is GoogleSnapshot {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.done === "boolean" && (r.dueAt === null || typeof r.dueAt === "string");
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);

/** What to change on `todo` to match Google, or null when nothing needs doing. */
export function reconcile(todo: Todo, remote: Remote): GooglePatch | null {
  // Finished to-dos are history; their Google copies are not ours to chase.
  if (todo.done) return null;

  const patch: GooglePatch = {};
  const base: GoogleSnapshot = todo.gsync ?? { dueAt: todo.dueAt ?? null, done: todo.done };
  let snapshot = { ...base };
  let changed = false;

  // Completed in Google Tasks. A to-do mirrored before snapshots existed has none,
  // and a completed Task beside an open to-do can only have come from Google.
  if (remote.task?.state === "ok" && remote.task.completed && base.done !== true) {
    patch.complete = true;
    snapshot = { ...snapshot, done: true };
    changed = true;
  }

  // Moved in Google Calendar.
  if (remote.event?.state === "ok" && remote.event.start) {
    if (!todo.gsync) {
      // First sight of this to-do: no way to say who moved it, so record what
      // we have and compare from the next pull on.
      snapshot = { ...snapshot, dueAt: todo.dueAt ?? null };
      changed = true;
    } else {
      const theirs = ms(remote.event.start);
      const synced = ms(todo.gsync.dueAt);
      const mine = ms(todo.dueAt);
      if (theirs !== null && theirs !== synced && mine === synced) {
        patch.dueAt = new Date(theirs).toISOString();
        snapshot = { ...snapshot, dueAt: patch.dueAt };
        changed = true;
      }
    }
  }

  if (remote.task?.state === "gone" && todo.googleTaskId) {
    patch.unlinkTask = true;
    changed = true;
  }
  if (remote.event?.state === "gone" && todo.googleEventId) {
    patch.unlinkEvent = true;
    changed = true;
  }

  if (!changed) return null;
  patch.gsync = snapshot;
  return patch;
}
