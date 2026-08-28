"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  deleteParty,
  fetchParties,
  saveParty,
  subscribeParties,
} from "@/features/filing/data/filingData";
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
      const cloud = await fetchParties(email);
      const cloudIds = new Set(cloud.map((p) => p.id));
      await Promise.all(
        ref.current
          .filter((p) => !cloudIds.has(p.id))
          .map((p) => saveParty(email, p).catch(() => {}))
      );
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) unsub = subscribeParties(email, setParties);
      });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [canSync, email]);

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
      if (canSync && email) saveParty(email, party).catch(() => {});
      return party;
    },
    [canSync, email]
  );

  const updateParty = useCallback(
    (id: string, patch: Partial<Omit<FilingParty, "id">>) => {
      setParties((prev) => {
        const next = prev.map((p) =>
          p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p
        );
        const updated = next.find((p) => p.id === id);
        if (canSync && email && updated) saveParty(email, updated).catch(() => {});
        return next;
      });
    },
    [canSync, email]
  );

  const removeParty = useCallback(
    (id: string) => {
      setParties((prev) => prev.filter((p) => p.id !== id));
      if (canSync && email) deleteParty(email, id).catch(() => {});
    },
    [canSync, email]
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
          if (canSync && email) saveParty(email, merged).catch(() => {});
        }
        return [...byId.values()];
      });
    },
    [canSync, email]
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
