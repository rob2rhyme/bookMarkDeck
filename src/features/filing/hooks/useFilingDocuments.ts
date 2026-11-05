"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  deleteDocument,
  fetchDocuments,
  saveDocument,
  subscribeDocuments,
} from "@/features/filing/data/filingData";
import { withLockInvariant } from "@/features/filing/lib/lock";
import { complete, nextDueOn, nudgeDates } from "@/features/filing/lib/obligations";
import type {
  CompleteDocument,
  FilingActivity,
  FilingActivityType,
  FilingDocument,
  Obligation,
} from "@/features/filing/lib/types";
import { todayKey } from "@/lib/dayKey";
import {
  durableDelete,
  durableSave,
  flushPendingDeletes,
  pendingUpsertIds,
  replayUpserts,
} from "@/utils/pendingDeletes";
import { untilAnswered } from "@/utils/untilAnswered";
import { recordSyncedIdsUnlessPending, toUpload } from "@/utils/syncedIds";

const BASE_KEY = "bookmarkdeck:filing:documents:v1";
const MAX_ACTIVITY = 300;

const keyFor = (email?: string | null) => (email ? `${BASE_KEY}:${email}` : BASE_KEY);

/**
 * The slim localStorage projection (ANALYSIS-FILING-LOG.md §7).
 *
 * Documents are the one collection that reaches thousands of records, and the
 * whole set would crowd the ~5 MB quota. Once the cloud copy has loaded, only
 * the fields the list, the search and the nav badge need are cached; notes,
 * references, obligations and activity come back with the next snapshot.
 *
 * Slim is only safe while a fuller copy exists elsewhere. Until the cloud copy
 * has loaded — including for an account that never syncs — documents are cached
 * whole, or every reload would drop every obligation, note and reference.
 *
 * `nextDueOn` is in here on purpose — it is what lets the badge and the Upcoming
 * panel render offline without loading every obligation array. The three
 * retention inputs are here for the same reason: paired with the folders cache
 * (which is stored whole), they let the shred queue and the nav badge compute
 * without a network round-trip.
 *
 * `bookmarkLink` is here on the same grounds. It is the connection that earns
 * this pillar its place — the policy in Drawer 2 and the insurer's login page as
 * one record — and leaving it out meant the link vanished from the papers list
 * on reload whenever the account wasn't synced. Roughly 100 bytes per linked
 * paper, which is a fair price for the headline feature surviving a refresh.
 */
type SlimDocument = Pick<
  FilingDocument,
  | "id"
  | "title"
  | "folderId"
  | "partyId"
  | "docType"
  | "docDate"
  | "filedAt"
  | "nextDueOn"
  | "remindFrom"
  | "nextDueDefault"
  | "retentionRuleId"
  | "overrideDestroyOn"
  | "bookmarkLink"
  | "confidential"
  | "tags"
  | "archived"
>;

const slim = (d: FilingDocument): SlimDocument => ({
  id: d.id,
  title: d.title,
  folderId: d.folderId,
  partyId: d.partyId,
  docType: d.docType,
  docDate: d.docDate,
  filedAt: d.filedAt,
  nextDueOn: d.nextDueOn,
  remindFrom: d.remindFrom,
  nextDueDefault: d.nextDueDefault,
  retentionRuleId: d.retentionRuleId,
  overrideDestroyOn: d.overrideDestroyOn,
  bookmarkLink: d.bookmarkLink,
  confidential: d.confidential,
  tags: d.tags,
  archived: d.archived,
});

/** Rehydrate a slim record into a usable document, marked `partial`: the fields
 *  the cache dropped are missing, not empty, and only the cloud copy has them. */
const rehydrate = (s: SlimDocument): FilingDocument => ({
  ...s,
  aliases: [],
  tags: s.tags ?? [],
  obligations: [],
  createdAt: null,
  updatedAt: null,
  partial: true,
});

/** A whole entry carries its obligations array; a slim one never does. */
const fromCache = (d: SlimDocument | FilingDocument): FilingDocument =>
  Array.isArray((d as FilingDocument).obligations)
    ? { ...(d as FilingDocument), aliases: (d as FilingDocument).aliases ?? [], tags: d.tags ?? [] }
    : rehydrate(d);

const isComplete = (d: FilingDocument): d is CompleteDocument => !d.partial;

/** Only for a record the cloud is known not to hold: then this copy, partial or
 *  not, is the fullest one that exists anywhere. */
const promote = (d: FilingDocument): CompleteDocument => ({ ...d, partial: undefined });

function loadLocal(email?: string | null): FilingDocument[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (d): d is SlimDocument | FilingDocument =>
          d && typeof d.id === "string" && typeof d.title === "string"
      )
      .map(fromCache);
  } catch {
    return [];
  }
}

/**
 * Stamp the derived cache from the obligations. Applied to EVERY write and to
 * everything arriving from Firestore, so these can never disagree with the
 * array they're derived from — a stale cache is what makes a badge lie.
 *
 * `remindFrom` / `nextDueDefault` are deliberately NOT persisted: they are a
 * pure function of `obligations`, and a derived value in two places is a
 * derived value that eventually drifts.
 *
 * It is also the one place every write and every snapshot passes, so it carries the
 * lock invariant (`withLockInvariant`): a locked paper never holds plaintext
 * reference or note in state, whatever built it.
 */
const withDerived = <T extends FilingDocument>(d: T): T =>
  withLockInvariant({
    ...d,
    nextDueOn: nextDueOn(d.obligations),
    ...nudgeDates(d.obligations),
  });

export type NewDocument = {
  /** Given when the caller must know it first: a locked paper's ciphertext is bound to its id. */
  id?: string;
  title: string;
  folderId?: string | null;
  partyId?: string | null;
  docType?: FilingDocument["docType"];
  docDate?: string;
  reference?: string;
  aliases?: string[];
  note?: string;
  /** Already sealed by the caller (lib/lock.ts); reference and note are then ignored. */
  lock?: FilingDocument["lock"];
};

export function useFilingDocuments(email?: string | null, connected = false) {
  const [documents, setDocuments] = useState<FilingDocument[]>([]);
  // WHICH account's cache has loaded, not just whether one has. In the render
  // where the email arrives the state in hand is still the signed-out key's:
  // writing it then put that list over the account's cache, and a connect in the
  // same commit replayed from the clobbered copy and dropped what was queued.
  const [cacheFor, setCacheFor] = useState<string | null>(null);
  const hydrated = cacheFor === (email ?? "");
  const canSync = connected && Boolean(email);
  // Which account's snapshot has arrived. Derived rather than a boolean so a
  // switch of account or a disconnect reads as "not loaded" with no reset.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const cloudLoaded = canSync && loadedFor === email;

  const ref = useRef(documents);
  useEffect(() => {
    ref.current = documents;
  }, [documents]);

  useEffect(() => {
    setDocuments(loadLocal(email));
    setCacheFor(email ?? "");
  }, [email]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      // Slim is safe only while a fuller copy exists elsewhere — so never for a
      // paper whose edit hasn't reached the cloud yet: cached whole, a tab closed
      // offline still has the edit to send on the next load.
      const queued = pendingUpsertIds("filingDocuments", email);
      const cached = cloudLoaded ? documents.map((d) => (queued.has(d.id) ? d : slim(d))) : documents;
      window.localStorage.setItem(keyFor(email), JSON.stringify(cached));
    } catch {
      /* quota — the cloud copy is still authoritative */
    }
  }, [documents, hydrated, email, cloudLoaded]);

  useEffect(() => {
    if (!canSync || !email || !hydrated) return;
    let cancelled = false;
    let unsub = () => {};
    (async () => {
      // Replay deletes made while disconnected, then upload papers the cloud
      // NEVER had, plus complete ones edited while disconnected (toUpload). One
      // it held at the last snapshot and lacks now was
      // deleted on another device. `promote` is safe here and nowhere else,
      // because there is no fuller copy to overwrite.
      await flushPendingDeletes("filingDocuments", email, (id) => deleteDocument(email, id));
      const cloud = await untilAnswered(() => fetchDocuments(email), () => cancelled);
      if (!cloud) return;
      const cloudIds = new Set(cloud.map((d) => d.id));
      // From the device cache, not this tab's copy: another tab may have edited a
      // queued record since this one loaded, and its copy is the one to send.
      const upload = toUpload(loadLocal(email), cloudIds, "filingDocuments", email)
        // An offline edit to a paper the cloud holds goes up only if complete:
        // a partial one would write its missing fields over the full copy.
        .flatMap((d) => (!cloudIds.has(d.id) ? [promote(d)] : isComplete(d) ? [d] : []));
      // Each leaves the queue once it lands; one that failed is tried again next connect.
      await replayUpserts("filingDocuments", email, upload, (d) => saveDocument(email, d));
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          unsub = subscribeDocuments(email, (cloud, meta) => {
            recordSyncedIdsUnlessPending("filingDocuments", email, cloud.map((d) => d.id), meta);
            setDocuments(cloud.map(withDerived));
            setLoadedFor(email);
          });
        }
      });
    return () => {
      cancelled = true;
      unsub();
      setLoadedFor(null);
    };
  }, [canSync, email, hydrated]);

  const onSaveError = useCallback((err: unknown) => {
    console.error("[filing] document save failed:", err);
  }, []);

  const addDocument = useCallback(
    (input: NewDocument): FilingDocument | null => {
      const title = input.title.trim();
      if (!title) return null;
      const now = new Date().toISOString();
      const document: CompleteDocument = {
        id: input.id ?? crypto.randomUUID(),
        title,
        folderId: input.folderId ?? null,
        partyId: input.partyId ?? null,
        docType: input.docType,
        docDate: input.docDate,
        reference: input.reference?.trim() || undefined,
        aliases: (input.aliases ?? []).map((a) => a.trim()).filter(Boolean),
        tags: [],
        note: input.note?.trim() || undefined,
        lock: input.lock ?? undefined,
        obligations: [],
        nextDueOn: null,
        remindFrom: null,
        nextDueDefault: null,
        activity: [
          { id: crypto.randomUUID(), type: "filed", at: now },
        ],
        createdAt: now,
        updatedAt: null,
      };
      const stamped = withDerived(document);
      setDocuments((prev) => [...prev, stamped]);
      durableSave("filingDocuments", email, stamped.id, canSync && email ? () => saveDocument(email, stamped) : null).catch(onSaveError);
      return stamped;
    },
    [canSync, email, onSaveError]
  );

  /**
   * While syncing, a partial record is left alone until its cloud copy lands —
   * seconds after load. Editing it would either write a stripped record over the
   * full one or, unsaved, be replaced by the snapshot a moment later.
   * `awaitingCloud` is what the dashboard shows meanwhile.
   *
   * Unsynced, edits apply and the record stays marked, so it is cached whole
   * from now on without ever becoming eligible to overwrite a cloud copy.
   */
  const patch = useCallback(
    (id: string, fn: (d: FilingDocument) => FilingDocument) => {
      setDocuments((prev) => {
        const target = prev.find((d) => d.id === id);
        if (!target || (canSync && target.partial)) return prev;
        const updated = withDerived({ ...fn(target), updatedAt: new Date().toISOString() });
        if (!canSync) durableSave("filingDocuments", email, id, null);
        else if (email && isComplete(updated))
          durableSave("filingDocuments", email, id, () => saveDocument(email, updated)).catch(onSaveError);
        return prev.map((d) => (d.id === id ? updated : d));
      });
    },
    [canSync, email, onSaveError]
  );

  const updateDocument = useCallback(
    (id: string, changes: Partial<Omit<FilingDocument, "id">>) =>
      patch(id, (d) => ({ ...d, ...changes })),
    [patch]
  );

  /** Move a paper into a folder (or out to the Unfiled inbox with null). */
  const fileInto = useCallback(
    (id: string, folderId: string | null) =>
      patch(id, (d) => ({
        ...d,
        folderId,
        filedAt: folderId ? todayKey() : d.filedAt, // a local day, like every reader of it
        activity: [
          ...(d.activity ?? []),
          { id: crypto.randomUUID(), type: "moved" as FilingActivityType, at: new Date().toISOString() },
        ].slice(-MAX_ACTIVITY),
      })),
    [patch]
  );

  const logActivity = useCallback(
    (id: string, entry: Omit<FilingActivity, "id" | "at"> & { at?: string }) =>
      patch(id, (d) => ({
        ...d,
        activity: [
          ...(d.activity ?? []),
          { id: crypto.randomUUID(), at: entry.at ?? new Date().toISOString(), ...entry },
        ].slice(-MAX_ACTIVITY),
      })),
    [patch]
  );

  const setArchived = useCallback(
    (id: string, archived: boolean) => patch(id, (d) => ({ ...d, archived })),
    [patch]
  );

  const addObligation = useCallback(
    (id: string, obligation: Omit<Obligation, "id">) =>
      patch(id, (d) => ({
        ...d,
        obligations: [...(d.obligations ?? []), { ...obligation, id: crypto.randomUUID() }],
      })),
    [patch]
  );

  const updateObligation = useCallback(
    (id: string, obligationId: string, changes: Partial<Omit<Obligation, "id">>) =>
      patch(id, (d) => ({
        ...d,
        obligations: (d.obligations ?? []).map((o) =>
          o.id === obligationId ? { ...o, ...changes } : o
        ),
      })),
    [patch]
  );

  /**
   * Mark one occurrence done. A repeat rolls forward by exactly one period
   * (see lib/obligations.complete) and logs the activity, so the timeline shows
   * what was actually paid or renewed and when.
   */
  const completeObligation = useCallback(
    (id: string, obligationId: string, on: string) =>
      patch(id, (d) => {
        const target = (d.obligations ?? []).find((o) => o.id === obligationId);
        if (!target) return d;
        const type: FilingActivityType = target.kind === "pay" ? "paid" : "renewed";
        return {
          ...d,
          obligations: (d.obligations ?? []).map((o) =>
            o.id === obligationId ? complete(o, on) : o
          ),
          activity: [
            ...(d.activity ?? []),
            {
              id: crypto.randomUUID(),
              type,
              at: new Date().toISOString(),
              note: target.label,
            },
          ].slice(-MAX_ACTIVITY),
        };
      }),
    [patch]
  );

  const removeObligation = useCallback(
    (id: string, obligationId: string) =>
      patch(id, (d) => ({
        ...d,
        obligations: (d.obligations ?? []).filter((o) => o.id !== obligationId),
      })),
    [patch]
  );

  /**
   * The end of a paper's life. Archives with a receipt rather than deleting:
   * the row stays, its timeline records that it was destroyed and when, and the
   * shred queue stops nagging. Nothing in this pillar deletes on a timer.
   */
  const markShredded = useCallback(
    (id: string, note?: string) =>
      patch(id, (d) => ({
        ...d,
        archived: true,
        activity: [
          ...(d.activity ?? []),
          {
            id: crypto.randomUUID(),
            type: "shredded" as FilingActivityType,
            at: new Date().toISOString(),
            note,
          },
        ].slice(-MAX_ACTIVITY),
      })),
    [patch]
  );

  /** Confirm a paper was looked at and is being kept — resets nothing, just records it. */
  const markReviewed = useCallback(
    (id: string, note?: string) =>
      patch(id, (d) => ({
        ...d,
        activity: [
          ...(d.activity ?? []),
          {
            id: crypto.randomUUID(),
            type: "reviewed" as FilingActivityType,
            at: new Date().toISOString(),
            note,
          },
        ].slice(-MAX_ACTIVITY),
      })),
    [patch]
  );

  const removeDocument = useCallback(
    (id: string) => {
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      // Queued until it lands; this also drops a queued edit, which must not be pushed back.
      durableDelete("filingDocuments", email, id, canSync && email ? () => deleteDocument(email, id) : null).catch(onSaveError);
    },
    [canSync, email, onSaveError]
  );

  /**
   * Restore from a backup: merge by id, restamp the derived cache, then push to
   * the cloud so an import isn't stranded on this device. Never deletes.
   *
   * A backup taken before the cloud copy loaded can hold partial records. Those
   * contribute only what they actually hold, so an empty obligations array in
   * the file can't erase the real one here.
   */
  const importMany = useCallback(
    (incoming: FilingDocument[]) => {
      if (incoming.length === 0) return;
      setDocuments((prev) => {
        const byId = new Map(prev.map((d) => [d.id, d]));
        for (const item of incoming) {
          const existing = byId.get(item.id);
          if (canSync && existing?.partial) continue; // as in `patch`
          let merged = withDerived(
            (existing
              ? { ...existing, ...(item.partial ? slim(item) : item) }
              : item) as FilingDocument
          );
          // Loaded and still absent: the cloud has no copy of this one.
          if (!existing && cloudLoaded) merged = promote(merged);
          byId.set(item.id, merged);
          const complete = isComplete(merged) ? merged : null;
          if (!canSync) durableSave("filingDocuments", email, merged.id, null);
          else if (email && complete)
            durableSave("filingDocuments", email, complete.id, () => saveDocument(email, complete)).catch(onSaveError);
        }
        return [...byId.values()];
      });
    },
    [canSync, cloudLoaded, email, onSaveError]
  );

  const active = useMemo(() => documents.filter((d) => !d.archived), [documents]);
  const awaitingCloud = canSync && !cloudLoaded && documents.some((d) => d.partial);
  const countByFolder = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of active) {
      const key = d.folderId ?? "__unfiled__";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [active]);

  return {
    documents,
    active,
    countByFolder,
    hydrated,
    awaitingCloud,
    importMany,
    addDocument,
    updateDocument,
    fileInto,
    logActivity,
    setArchived,
    markShredded,
    markReviewed,
    removeDocument,
    addObligation,
    updateObligation,
    completeObligation,
    removeObligation,
    setDocuments,
  };
}
