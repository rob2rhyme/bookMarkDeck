"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  deleteParty,
  fetchParties,
  saveParty,
  subscribeParties,
} from "@/features/filing/data/filingData";
import {
  durableDelete,
  durableSave,
  flushPendingDeletes,
  replayUpserts,
} from "@/utils/pendingDeletes";
import { untilAnswered } from "@/utils/untilAnswered";
import { recordSyncedIdsUnlessPending, toUpload } from "@/utils/syncedIds";
import type { FilingParty, PartyKind, TabColor } from "@/features/filing/lib/types";

const BASE_KEY = "bookmarkdeck:filing:parties:v1";

const keyFor = (email?: string | null) => (email ? `${BASE_KEY}:${email}` : BASE_KEY);

function loadLocal(email?: string | null): FilingParty[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is FilingParty =>
        p && typeof p.id === "string" && typeof p.name === "string"
    );
  } catch {
    return [];
  }
}

export function useFilingParties(email?: string | null, connected = false) {
  const [parties, setParties] = useState<FilingParty[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const canSync = connected && Boolean(email);

  const ref = useRef(parties);
  useEffect(() => {
    ref.current = parties;
  }, [parties]);

  useEffect(() => {
    setParties(loadLocal(email));
    setHydrated(true);
  }, [email]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(keyFor(email), JSON.stringify(parties));
    } catch {
      /* quota */
    }
  }, [parties, hydrated, email]);

  useEffect(() => {
    if (!canSync || !email) return;
    let cancelled = false;
    let unsub = () => {};
    (async () => {
      // Replay deletes made while disconnected first, then upload what the cloud
      // NEVER had plus what was edited while disconnected (toUpload). A record
      // it had at the last snapshot and lacks now was deleted on another device
      // — uploading "everything the cloud lacks" recreated it for everyone.
      await flushPendingDeletes("filingParties", email, (id) => deleteParty(email, id));
      const cloud = await untilAnswered(() => fetchParties(email), () => cancelled);
      if (!cloud) return;
      const cloudIds = new Set(cloud.map((p) => p.id));
      // Each leaves the queue once it lands; one that failed is tried again next connect.
      // From the device cache, not this tab's copy: another tab may have edited a
      // queued record since this one loaded, and its copy is the one to send.
      await replayUpserts("filingParties", email, toUpload(loadLocal(email), cloudIds, "filingParties", email), (p) =>
        saveParty(email, p)
      );
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          unsub = subscribeParties(email, (cloud, meta) => {
            recordSyncedIdsUnlessPending("filingParties", email, cloud.map((p) => p.id), meta);
            setParties(cloud);
          });
        }
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [canSync, email]);

  // A rejected write (e.g. a doc over Firestore's 1 MiB cap) should be
  // diagnosable rather than silent — same as the folders/documents hooks and
  // features/inventory/hooks/useInventory.ts.
  const onSaveError = useCallback((err: unknown) => {
    console.error("[filing] party save failed:", err);
  }, []);

  const addParty = useCallback(
    (name: string, kind: PartyKind = "family", color?: TabColor): FilingParty | null => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const party: FilingParty = {
        id: crypto.randomUUID(),
        name: trimmed,
        kind,
        color,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
      setParties((prev) => [...prev, party]);
      durableSave("filingParties", email, party.id, canSync && email ? () => saveParty(email, party) : null).catch(onSaveError);
      return party;
    },
    [canSync, email, onSaveError]
  );

  const updateParty = useCallback(
    (id: string, patch: Partial<Omit<FilingParty, "id">>) => {
      setParties((prev) => {
        const next = prev.map((p) =>
          p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p
        );
        const updated = next.find((p) => p.id === id);
        if (updated)
          durableSave("filingParties", email, updated.id, canSync && email ? () => saveParty(email, updated) : null).catch(onSaveError);
        return next;
      });
    },
    [canSync, email, onSaveError]
  );

  const removeParty = useCallback(
    (id: string) => {
      setParties((prev) => prev.filter((p) => p.id !== id));
      // Queued until it lands; this also drops a queued edit, which must not be pushed back.
      durableDelete("filingParties", email, id, canSync && email ? () => deleteParty(email, id) : null).catch(onSaveError);
    },
    [canSync, email, onSaveError]
  );

  const active = useMemo(() => parties.filter((p) => !p.archived), [parties]);
  const byId = useMemo(
    () => Object.fromEntries(parties.map((p) => [p.id, p])),
    [parties]
  );

  /**
   * Restore from a backup: merge by id, then push each result to the cloud so an
   * import isn't stranded on this device. Never deletes — see lib/exportFiling.
   */
  const importMany = useCallback(
    (incoming: FilingParty[]) => {
      if (incoming.length === 0) return;
      setParties((prev) => {
        const byId = new Map(prev.map((x) => [x.id, x]));
        for (const item of incoming) {
          const merged = { ...(byId.get(item.id) ?? {}), ...item } as FilingParty;
          byId.set(item.id, merged);
          durableSave("filingParties", email, merged.id, canSync && email ? () => saveParty(email, merged) : null).catch(onSaveError);
        }
        return [...byId.values()];
      });
    },
    [canSync, email, onSaveError]
  );

  return {
    parties,
    active,
    byId,
    hydrated,
    importMany,
    addParty,
    updateParty,
    removeParty,
    setParties,
  };
}
