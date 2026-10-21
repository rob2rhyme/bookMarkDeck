// Two devices edited the same note: keep both instead of letting one erase the other.
//
// A device remembers, per note, the cloud's `updatedAt` it last saw (its BASE). When
// it reconnects with offline edits, a note whose cloud copy has moved past that base
// was ALSO edited elsewhere. Before this, the reconnect upload simply overwrote it.
// Now the newer version stays in the note and the other is saved beside it as a
// "(conflicted copy)" tagged #conflict, so nothing is lost and the list shows it.
//
// Locked notes keep last-writer-wins: their ciphertext is bound to the note's id
// (lib/vault.ts), so a copy under a new id could never be decrypted.
//
// Scope: edits made while disconnected, reconciled on reconnect. Two devices both
// online and typing in the same note within the same few seconds still resolve by
// last writer, as the editor documents.

import { normalizeTag } from "@/features/notes/lib/tags";
import type { Note } from "@/features/notes/lib/notes";

const BASE = "bookmarkdeck:notes:base:v1";
export const conflictBaseKey = (email?: string | null) => (email ? `${BASE}:${email}` : BASE);

export const CONFLICT_TAG = "conflict";
export const CONFLICTS_FOUND = "bd:notes-conflicts";

export type BaseMap = Record<string, string>;

export function readBase(email: string | null | undefined): BaseMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(conflictBaseKey(email)) ?? "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as BaseMap) : {};
  } catch {
    return {};
  }
}

/** Remember these as the cloud versions this device has seen. Pass `prune` to drop ids not in the list. */
export function recordBase(
  email: string | null | undefined,
  notes: Pick<Note, "id" | "updatedAt">[],
  prune = false
): void {
  if (typeof window === "undefined" || !email) return;
  const next: BaseMap = prune ? {} : readBase(email);
  for (const n of notes) next[n.id] = n.updatedAt;
  try {
    window.localStorage.setItem(conflictBaseKey(email), JSON.stringify(next));
  } catch {
    /* without a base the next reconnect falls back to last writer wins */
  }
}

/** The parts of a note two devices can disagree on. Pins and tags merge-free by design. */
export function textDiffers(a: Note, b: Note): boolean {
  return a.title !== b.title || a.body !== b.body || (a.lock?.ct ?? "") !== (b.lock?.ct ?? "");
}

export function conflictCopy(loser: Note, now: Date, id: string = crypto.randomUUID()): Note {
  const at = now.toISOString();
  const title = loser.title.trim() || "Untitled";
  return {
    id,
    title: `${title} (conflicted copy)`,
    body: loser.body,
    pinned: false,
    tags: [...new Set([...loser.tags, normalizeTag(CONFLICT_TAG) ?? CONFLICT_TAG])],
    createdAt: at,
    updatedAt: at,
    activity: [{ at, kind: "conflict" }],
  };
}

export type ReconnectPlan = {
  /** Local versions to upload (new notes, and offline edits that win or meet no conflict). */
  push: Note[];
  /** Losing versions, saved as new notes. */
  copies: Note[];
  /** Offline edits the cloud's newer version replaces (their text survives as a copy). */
  superseded: string[];
};

/**
 * Decide what a reconnecting device uploads. `uploads` is what it would have pushed
 * (toUpload); `cloud` is what the server holds now. An upload whose cloud copy moved
 * past this device's base, with different text, is a conflict: the newer version
 * wins the note and the older one becomes a copy. A note with no recorded base (an
 * edit made before this existed) keeps the old behaviour and uploads.
 */
export function planReconnect(
  uploads: Note[],
  cloud: Map<string, Note>,
  base: BaseMap,
  now: Date,
  newId: () => string = () => crypto.randomUUID()
): ReconnectPlan {
  const plan: ReconnectPlan = { push: [], copies: [], superseded: [] };
  for (const local of uploads) {
    const remote = cloud.get(local.id);
    const seen = base[local.id];
    const conflict =
      remote &&
      seen !== undefined &&
      remote.updatedAt > seen &&
      !local.lock &&
      !remote.lock &&
      textDiffers(local, remote);
    if (!conflict) {
      plan.push.push(local);
      continue;
    }
    if (local.updatedAt >= remote.updatedAt) {
      plan.push.push(local);
      plan.copies.push(conflictCopy(remote, now, newId()));
    } else {
      plan.superseded.push(local.id);
      plan.copies.push(conflictCopy(local, now, newId()));
    }
  }
  return plan;
}
