"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  deleteDocument,
  fetchDocuments,
  saveDocument,
  subscribeDocuments,
} from "@/features/filing/data/filingData";
import type {
  FilingActivity,
  FilingActivityType,
  FilingDocument,
} from "@/features/filing/lib/types";

const BASE_KEY = "bookmarkdeck:filing:documents:v1";
const MAX_ACTIVITY = 300;

const keyFor = (email?: string | null) => (email ? `${BASE_KEY}:${email}` : BASE_KEY);

/**
 * The slim localStorage projection (ANALYSIS-FILING-LOG.md §7).
 *
 * Documents are the one collection that reaches thousands of records, and the
 * whole set would crowd the ~5 MB quota. Only the fields the list, the search
 * and the nav badge need are cached; notes, references, obligations and activity
 * come back from Firestore when a document is opened.
 *
 * `nextDueOn` is in here on purpose — it is what lets the badge and the Upcoming
 * panel render offline without loading every obligation array.
 */
type SlimDocument = Pick<
  FilingDocument,
  "id" | "title" | "folderId" | "partyId" | "docType" | "docDate" | "nextDueOn" | "tags" | "archived"
>;

const slim = (d: FilingDocument): SlimDocument => ({
  id: d.id,
  title: d.title,
  folderId: d.folderId,
  partyId: d.partyId,
  docType: d.docType,
  docDate: d.docDate,
  nextDueOn: d.nextDueOn,
  tags: d.tags,
  archived: d.archived,
});

/** Rehydrate a slim record into a usable document. Absent fields stay absent
 *  rather than being invented — the cloud copy fills them in. */
const rehydrate = (s: SlimDocument): FilingDocument => ({
  ...s,
  aliases: [],
  tags: s.tags ?? [],
  obligations: [],
  createdAt: null,
  updatedAt: null,
});

function loadLocal(email?: string | null): FilingDocument[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (d): d is SlimDocument =>
          d && typeof d.id === "string" && typeof d.title === "string"
      )
      .map(rehydrate);
  } catch {
    return [];
  }
}

export type NewDocument = {
  title: string;
  folderId?: string | null;
  partyId?: string | null;
  docType?: FilingDocument["docType"];
  docDate?: string;
  reference?: string;
  aliases?: string[];
  note?: string;
};

export function useFilingDocuments(email?: string | null, connected = false) {
  const [documents, setDocuments] = useState<FilingDocument[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const canSync = connected && Boolean(email);

  const ref = useRef(documents);
  useEffect(() => {
    ref.current = documents;
  }, [documents]);

  useEffect(() => {
    setDocuments(loadLocal(email));
    setHydrated(true);
  }, [email]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(keyFor(email), JSON.stringify(documents.map(slim)));
    } catch {
      /* quota — the cloud copy is still authoritative */
    }
  }, [documents, hydrated, email]);

  useEffect(() => {
    if (!canSync || !email) return;
    let cancelled = false;
    let unsub = () => {};
    (async () => {
      const cloud = await fetchDocuments(email);
      const cloudIds = new Set(cloud.map((d) => d.id));
      await Promise.all(
        ref.current
          .filter((d) => !cloudIds.has(d.id))
          .map((d) => saveDocument(email, d).catch(() => {}))
      );
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) unsub = subscribeDocuments(email, setDocuments);
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [canSync, email]);

  const onSaveError = useCallback((err: unknown) => {
    console.error("[filing] document save failed:", err);
  }, []);

  const addDocument = useCallback(
    (input: NewDocument): FilingDocument | null => {
      const title = input.title.trim();
      if (!title) return null;
      const now = new Date().toISOString();
      const document: FilingDocument = {
        id: crypto.randomUUID(),
        title,
        folderId: input.folderId ?? null,
        partyId: input.partyId ?? null,
        docType: input.docType,
        docDate: input.docDate,
        reference: input.reference?.trim() || undefined,
        aliases: (input.aliases ?? []).map((a) => a.trim()).filter(Boolean),
        tags: [],
        note: input.note?.trim() || undefined,
        obligations: [],
        nextDueOn: null,
        activity: [
          { id: crypto.randomUUID(), type: "filed", at: now },
        ],
        createdAt: now,
        updatedAt: null,
      };
      setDocuments((prev) => [...prev, document]);
      if (canSync && email) saveDocument(email, document).catch(onSaveError);
      return document;
    },
    [canSync, email, onSaveError]
  );

  const patch = useCallback(
    (id: string, fn: (d: FilingDocument) => FilingDocument) => {
      setDocuments((prev) => {
        const next = prev.map((d) =>
          d.id === id ? { ...fn(d), updatedAt: new Date().toISOString() } : d
        );
        const updated = next.find((d) => d.id === id);
        if (canSync && email && updated) saveDocument(email, updated).catch(onSaveError);
        return next;
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
        filedAt: folderId ? new Date().toISOString().slice(0, 10) : d.filedAt,
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

  const removeDocument = useCallback(
    (id: string) => {
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      if (canSync && email) deleteDocument(email, id).catch(onSaveError);
    },
    [canSync, email, onSaveError]
  );

  const active = useMemo(() => documents.filter((d) => !d.archived), [documents]);
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
    addDocument,
    updateDocument,
    fileInto,
    logActivity,
    setArchived,
    removeDocument,
    setDocuments,
  };
}
