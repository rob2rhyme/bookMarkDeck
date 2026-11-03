"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { appendDeletion, deleteNote, fetchNotes, saveNote, subscribeNotes } from "@/features/notes/data/notesData";
import { mergeDeletions, readDeletions, writeDeletions } from "@/features/notes/lib/deletionLog";
import { newNote, normalizeNote, sortNotes, type Note } from "@/features/notes/lib/notes";
import { normalizeTag, normalizeTags, renameIn } from "@/features/notes/lib/tags";
import {
  durableDelete,
  durableSave,
  flushPendingDeletes,
  queueUpsert,
  replayUpserts,
  unqueueDelete,
} from "@/utils/pendingDeletes";
import { untilAnswered } from "@/utils/untilAnswered";
import { recordSyncedIdsUnlessPending, toUpload } from "@/utils/syncedIds";
import { notesCacheKey } from "@/lib/notesIndex";
import { appendEvent, tagDiff, type NoteEvent } from "@/features/notes/lib/activity";
import { CONFLICTS_FOUND, planReconnect, readBase, recordBase } from "@/features/notes/lib/conflicts";

// Same model as the filing hooks: a per-user localStorage cache renders at once,
// a live Firestore subscription takes over once connected, and every change is
// queued first (durableSave / durableDelete) — signed in or not — and leaves the
// queue only once the server has it, so one made offline survives a tab close.
//
// The cache is written SYNCHRONOUSLY by every change, not from an effect: the
// editor saves on pagehide and on unmount, and neither waits for another render.

const DOMAIN = "notes";

/** A save the cloud refused for good (detail: the note's title). The cache still has it. */
export const SAVE_FAILED = "bd:notes-save-failed";
// The key lives in @/lib/notesIndex, which the ⌘K palette reads too.
const keyFor = notesCacheKey;

function loadLocal(email?: string | null): Note[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeNote).filter((n): n is Note => n !== null);
  } catch {
    return [];
  }
}

/**
 * Same-tab change signal. The list and the editor are separate routes, each with
 * its own instance of this hook, and a change can land after one unmounts — an
 * Undo from the toast, or the editor discarding a note left blank. `storage`
 * events only reach OTHER tabs, so this one covers the current tab.
 */
const CHANGED_EVENT = "bd:notes-cache-changed";

function saveLocal(email: string | null | undefined, notes: Note[], source: symbol) {
  try {
    window.localStorage.setItem(keyFor(email), JSON.stringify(notes));
  } catch {
    /* quota — the cloud copy is still authoritative once synced */
  }
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { key: keyFor(email), source } }));
}

/** `lock: null` removes a lock (the patch must then carry the plaintext body). */
export type NotePatch = Partial<Pick<Note, "title" | "body" | "pinned" | "tags">> & { lock?: Note["lock"] | null };

/**
 * The history entries a patch adds. Pinning and tagging are their own events; a
 * change of title or body is an edit (coalesced, lib/activity.ts); adding or
 * removing the lock is locking, while a new ciphertext on a still-locked note is
 * an edit of its text.
 */
function historyFor(cur: Note, next: Note, changed: (keyof NotePatch)[], at: string): NoteEvent[] | undefined {
  let h = cur.activity;
  if (changed.includes("pinned")) h = appendEvent(h, { at, kind: next.pinned ? "pinned" : "unpinned" });
  if (changed.includes("tags")) h = appendEvent(h, { at, kind: "tagged", ...tagDiff(cur.tags, next.tags) });
  if (!cur.lock && next.lock) h = appendEvent(h, { at, kind: "locked" });
  else if (cur.lock && !next.lock) h = appendEvent(h, { at, kind: "unlocked" });
  else if (changed.some((k) => k === "title" || k === "body" || k === "lock")) h = appendEvent(h, { at, kind: "edited" });
  return h;
}

export function useNotes(email?: string | null, connected = false) {
  const [notes, setNotes] = useState<Note[]>([]);
  // WHICH cache has loaded, not just whether one has. The email arrives after
  // the session does; until that account's cache is read, the list in hand is
  // another key's (or empty), and a change committed from it would replace the
  // account's whole cache with it.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loadedRef = useRef<string | null>(null);
  const hydrated = loadedKey === keyFor(email);
  // True once the first cloud snapshot has arrived — until then a note missing
  // from the cache may still be on its way (opened from another device).
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const canSync = connected && Boolean(email);

  const ref = useRef<Note[]>(notes);
  const [self] = useState(() => Symbol("useNotes"));

  // An instance can be asked to act after it unmounts — the toast's Undo, or the
  // editor discarding a blank note — when its `ref` no longer follows the cache
  // (it stopped listening). Working from that stale copy would overwrite whatever
  // the mounted list did since, so an unmounted instance reads the cache itself.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // The same goes for a mounted instance whose account's cache hasn't loaded yet.
  const current = useCallback(
    () => (mounted.current && loadedRef.current === keyFor(email) ? ref.current : loadLocal(email)),
    [email]
  );

  useEffect(() => {
    const local = loadLocal(email);
    ref.current = local;
    loadedRef.current = keyFor(email);
    setNotes(local);
    setLoadedKey(keyFor(email));
  }, [email]);

  // Adopt the cache when another instance (this tab) or another tab writes it.
  // Without this a stale tab's next edit would write its old array back over
  // whatever the other one added. Adoption, not a merge: last write wins.
  useEffect(() => {
    const key = keyFor(email);
    const adopt = () => {
      const local = loadLocal(email);
      ref.current = local;
      setNotes(local);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea === window.localStorage && e.key === key) adopt();
    };
    const onChanged = (e: Event) => {
      const d = (e as CustomEvent<{ key: string; source: symbol }>).detail;
      if (d?.key === key && d.source !== self) adopt();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGED_EVENT, onChanged);
    };
  }, [email, self]);

  const commit = useCallback(
    (next: Note[]) => {
      ref.current = next;
      setNotes(next);
      saveLocal(email, next, self);
    },
    [email, self]
  );

  // On connect: replay offline deletes, upload what the cloud never had plus
  // what was edited offline (toUpload), THEN attach the listener — so the first
  // snapshot can't drop notes written before connecting. An offline edit to a
  // note another device ALSO changed meanwhile keeps both (lib/conflicts.ts): the
  // newer version wins the note, the other is written as a conflicted copy.
  useEffect(() => {
    if (!canSync || !email) return;
    let cancelled = false;
    let unsub = () => {};
    (async () => {
      await flushPendingDeletes(DOMAIN, email, (id) => deleteNote(email, id));
      const cloud = await untilAnswered(() => fetchNotes(email), () => cancelled);
      if (!cloud) return;
      const cloudById = new Map(cloud.map((n) => [n.id, n]));
      const plan = planReconnect(
        toUpload(ref.current, new Set(cloudById.keys()), DOMAIN, email),
        cloudById,
        readBase(email),
        new Date()
      );
      if (plan.copies.length) commit([...current(), ...plan.copies]);
      // A conflicted copy is new here: queued like any other change, so a tab
      // closed before it lands still has it to send.
      for (const n of plan.copies) queueUpsert(DOMAIN, email, n.id);
      await replayUpserts(DOMAIN, email, [...plan.push, ...plan.copies], (n) =>
        saveNote(email, n).then(() => recordBase(email, [n]))
      );
      if (plan.copies.length) {
        window.dispatchEvent(new CustomEvent(CONFLICTS_FOUND, { detail: { count: plan.copies.length } }));
      }
    })()
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        unsub = subscribeNotes(email, (cloud, meta) => {
          recordSyncedIdsUnlessPending(DOMAIN, email, cloud.map((n) => n.id), meta);
          recordBase(email, cloud, true);
          commit(cloud);
          setCloudLoaded(true);
        });
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [canSync, email, commit, current]);

  /**
   * Push one note. Resolves once it is queued — saved on this device — and the
   * cloud write carries on in the background. Waiting for the cloud stalled the
   * editor offline: its saves run one after another, and the first never settled.
   */
  const write = useCallback(
    (note: Note): Promise<void> => {
      const send = canSync && email ? () => saveNote(email, note).then(() => recordBase(email, [note])) : null;
      durableSave(DOMAIN, email, note.id, send).catch((err) => {
        // Refused for good (e.g. over Firestore's 1 MiB document cap): say so.
        // Anything else stays queued and is sent again on the next connect.
        console.error("[notes] save failed:", err);
        window.dispatchEvent(new CustomEvent(SAVE_FAILED, { detail: { title: note.title } }));
      });
      return Promise.resolve();
    },
    [canSync, email]
  );

  const createNote = useCallback(
    (init: Partial<Pick<Note, "title" | "body">> = {}): Note => {
      const note = newNote(init);
      commit([...current(), note]);
      write(note).catch(() => {});
      return note;
    },
    [commit, current, write]
  );

  /**
   * Apply a patch. Title/body changes bump updatedAt (the list order); a pin
   * toggle or a tag change does not — organising a note isn't editing it. A
   * patch that changes nothing writes nothing.
   */
  const updateNote = useCallback(
    (id: string, input: NotePatch): Promise<void> => {
      const patch = input.tags ? { ...input, tags: normalizeTags(input.tags) } : input;
      const list = current();
      const cur = list.find((n) => n.id === id);
      if (!cur) return Promise.resolve();
      const changed = (Object.keys(patch) as (keyof NotePatch)[]).filter(
        (k) => JSON.stringify(patch[k]) !== JSON.stringify(cur[k])
      );
      if (changed.length === 0) return Promise.resolve();
      const edited = changed.some((k) => k === "title" || k === "body" || k === "lock");
      const { lock, ...rest } = patch;
      const now = new Date().toISOString();
      const next: Note = {
        ...cur,
        ...rest,
        updatedAt: edited ? now : cur.updatedAt,
      };
      if (lock === null) delete next.lock;
      else if (lock) next.lock = lock;
      next.activity = historyFor(cur, next, changed, now);
      // A locked note never holds plaintext — not in state, not in the cache.
      if (next.lock) next.body = "";
      commit(list.map((n) => (n.id === id ? next : n)));
      return write(next);
    },
    [commit, current, write]
  );

  /**
   * Rename a tag on every note that has it (merging into `to` if a note already
   * has that), or remove it everywhere when `to` is null. Returns how many notes
   * changed. Like a tag edit, it doesn't bump updatedAt.
   */
  const retag = useCallback(
    (from: string, to: string | null): number => {
      const target = to === null ? null : normalizeTag(to);
      if (to !== null && (!target || target === from)) return 0;
      const changed: Note[] = [];
      const next = current().map((n) => {
        if (!n.tags.includes(from)) return n;
        const tags = target ? renameIn(n.tags, from, target) : n.tags.filter((t) => t !== from);
        const updated: Note = {
          ...n,
          tags,
          activity: appendEvent(n.activity, { at: new Date().toISOString(), kind: "tagged", ...tagDiff(n.tags, tags) }),
        };
        changed.push(updated);
        return updated;
      });
      if (changed.length === 0) return 0;
      commit(next);
      changed.forEach((n) => write(n).catch(() => {}));
      return changed.length;
    },
    [commit, current, write]
  );

  /**
   * Restore from a backup: write the notes planImport chose (new, or newer than
   * this device's copy) — merging by id, never deleting. A restored id cancels any
   * delete still queued for it. Each note is written like any edit, so it reaches
   * the cloud now or on the next connect.
   */
  const importNotes = useCallback(
    (incoming: Note[]) => {
      if (incoming.length === 0) return;
      const byId = new Map(current().map((n) => [n.id, n]));
      const at = new Date().toISOString();
      const written = incoming.map((n) => ({ ...n, activity: appendEvent(n.activity, { at, kind: "imported" }) }));
      for (const n of written) {
        byId.set(n.id, n);
        unqueueDelete(DOMAIN, email, n.id);
      }
      commit([...byId.values()]);
      written.forEach((n) => write(n).catch(() => {}));
    },
    [commit, current, email, write]
  );

  /** Remove a note; returns it so the caller can offer Undo (restoreNote). */
  const removeNote = useCallback(
    (id: string): Note | null => {
      const list = current();
      const cur = list.find((n) => n.id === id) ?? null;
      if (!cur) return null;
      commit(list.filter((n) => n.id !== id));
      // The note's own history goes with it, so the account log records the delete.
      // Offline, the cache holds it until useDeletionLog next merges with the cloud.
      const entry = { id, title: cur.title.trim(), at: new Date().toISOString() };
      writeDeletions(email, mergeDeletions([entry], readDeletions(email)));
      if (canSync && email) appendDeletion(email, entry).catch(() => {});
      // Queued until it lands; this also drops a queued edit, which must not be pushed back.
      durableDelete(DOMAIN, email, id, canSync && email ? () => deleteNote(email, id) : null).catch((err) =>
        console.error("[notes] delete failed:", err)
      );
      return cur;
    },
    [canSync, email, commit, current]
  );

  const restoreNote = useCallback(
    (deleted: Note) => {
      const list = current();
      if (list.some((n) => n.id === deleted.id)) return;
      const note = { ...deleted, activity: appendEvent(deleted.activity, { at: new Date().toISOString(), kind: "restored" }) };
      unqueueDelete(DOMAIN, email, note.id);
      commit([...list, note]);
      write(note).catch(() => {});
    },
    [commit, current, email, write]
  );

  const sorted = useMemo(() => sortNotes(notes), [notes]);

  return {
    notes: sorted,
    hydrated,
    cloudLoaded,
    canSync,
    createNote,
    updateNote,
    removeNote,
    restoreNote,
    retag,
    importNotes,
  };
}
