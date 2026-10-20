"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { deleteNote, fetchNotes, saveNote, subscribeNotes } from "@/features/notes/data/notesData";
import { newNote, normalizeNote, sortNotes, type Note } from "@/features/notes/lib/notes";
import { normalizeTag, normalizeTags, renameIn } from "@/features/notes/lib/tags";
import {
  clearPendingUpserts,
  flushPendingDeletes,
  queueDelete,
  queueUpsert,
  unqueueDelete,
  unqueueUpsert,
} from "@/utils/pendingDeletes";
import { recordSyncedIds, toUpload } from "@/utils/syncedIds";

// Same model as the filing hooks: a per-user localStorage cache renders at once,
// a live Firestore subscription takes over once connected, and changes made while
// disconnected are queued (queueUpsert / queueDelete) and pushed on connect.
//
// The cache is written SYNCHRONOUSLY by every change, not from an effect: the
// editor saves on pagehide and on unmount, and neither waits for another render.

const DOMAIN = "notes";
const BASE_KEY = "bookmarkdeck:notes:v1";
const keyFor = (email?: string | null) => (email ? `${BASE_KEY}:${email}` : BASE_KEY);

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

export type NotePatch = Partial<Pick<Note, "title" | "body" | "pinned" | "tags">>;

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
  // snapshot can't drop notes written before connecting.
  useEffect(() => {
    if (!canSync || !email) return;
    let cancelled = false;
    let unsub = () => {};
    (async () => {
      await flushPendingDeletes(DOMAIN, email, (id) => deleteNote(email, id));
      const cloud = await fetchNotes(email);
      const cloudIds = new Set(cloud.map((n) => n.id));
      await Promise.all(
        toUpload(ref.current, cloudIds, DOMAIN, email).map((n) => saveNote(email, n).catch(() => {}))
      );
      clearPendingUpserts(DOMAIN, email);
    })()
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        unsub = subscribeNotes(email, (cloud) => {
          recordSyncedIds(DOMAIN, email, cloud.map((n) => n.id));
          commit(cloud);
          setCloudLoaded(true);
        });
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [canSync, email, commit]);

  /** Push one note. Resolves when the cloud has it — or at once when it was only queued. */
  const write = useCallback(
    (note: Note): Promise<void> => {
      if (canSync && email) {
        return saveNote(email, note).catch((err) => {
          // A rejected write (e.g. over Firestore's 1 MiB document cap) should be
          // diagnosable, and the editor shows it as a failed save.
          console.error("[notes] save failed:", err);
          throw err;
        });
      }
      queueUpsert(DOMAIN, email, note.id);
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
      const edited = changed.some((k) => k === "title" || k === "body");
      const next: Note = {
        ...cur,
        ...patch,
        updatedAt: edited ? new Date().toISOString() : cur.updatedAt,
      };
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
        const updated = { ...n, tags };
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

  /** Remove a note; returns it so the caller can offer Undo (restoreNote). */
  const removeNote = useCallback(
    (id: string): Note | null => {
      const list = current();
      const cur = list.find((n) => n.id === id) ?? null;
      if (!cur) return null;
      commit(list.filter((n) => n.id !== id));
      unqueueUpsert(DOMAIN, email, id); // an offline edit to it must not be pushed back
      if (canSync && email) {
        deleteNote(email, id).catch((err) => console.error("[notes] delete failed:", err));
      } else {
        queueDelete(DOMAIN, email, id); // replayed on connect
      }
      return cur;
    },
    [canSync, email, commit, current]
  );

  const restoreNote = useCallback(
    (note: Note) => {
      const list = current();
      if (list.some((n) => n.id === note.id)) return;
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
  };
}
