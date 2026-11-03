"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchSettings, saveSettings } from "@/features/filing/data/filingData";
import {
  DEFAULT_FILING_SETTINGS,
  normalizeSettings,
  type FilingSettings,
} from "@/features/filing/lib/types";
import { durableSave, pendingUpsertIds } from "@/utils/pendingDeletes";
import { untilAnswered } from "@/utils/untilAnswered";

// Read by useFilingReminderCount too — keep the key in sync.
const BASE_KEY = "bookmarkdeck:filing:settings:v1";

const keyFor = (email?: string | null) => (email ? `${BASE_KEY}:${email}` : BASE_KEY);
// A local change not yet in the cloud is queued under this one id — it outlives a
// reload, where the in-memory flag it replaces did not.
const DOMAIN = "filingSettings";
const ID = "settings";

function loadLocal(email?: string | null): FilingSettings {
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    return raw ? normalizeSettings(JSON.parse(raw)) : DEFAULT_FILING_SETTINGS;
  } catch {
    return DEFAULT_FILING_SETTINGS;
  }
}

export function useFilingSettings(email?: string | null, connected = false) {
  const [settings, setSettings] = useState<FilingSettings>(DEFAULT_FILING_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const canSync = connected && Boolean(email);
  useEffect(() => {
    setSettings(loadLocal(email));
    setHydrated(true);
  }, [email]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(keyFor(email), JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings, hydrated, email]);

  // A local edit not yet in the cloud must win, or connecting would silently
  // revert it — including one made before a reload.
  useEffect(() => {
    if (!canSync || !email) return;
    let cancelled = false;
    (async () => {
      const remote = await untilAnswered(() => fetchSettings(email), () => cancelled);
      if (cancelled) return;
      if (pendingUpsertIds(DOMAIN, email).has(ID) || !remote) {
        const local = loadLocal(email);
        await durableSave(DOMAIN, email, ID, () => saveSettings(email, local));
      } else setSettings(remote);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canSync, email]);

  const update = useCallback(
    (patch: Partial<FilingSettings>) => {
      setSettings((prev) => {
        const next = normalizeSettings({ ...prev, ...patch });
        durableSave(DOMAIN, email, ID, canSync && email ? () => saveSettings(email, next) : null).catch(() => {});
        return next;
      });
    },
    [canSync, email]
  );

  return { settings, hydrated, update };
}
