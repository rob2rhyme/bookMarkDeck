"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchSettings, saveSettings } from "@/features/filing/data/filingData";
import {
  DEFAULT_FILING_SETTINGS,
  normalizeSettings,
  type FilingSettings,
} from "@/features/filing/lib/types";

// Read by useFilingReminderCount too — keep the key in sync.
const BASE_KEY = "bookmarkdeck:filing:settings:v1";

const keyFor = (email?: string | null) => (email ? `${BASE_KEY}:${email}` : BASE_KEY);

export function useFilingSettings(email?: string | null, connected = false) {
  const [settings, setSettings] = useState<FilingSettings>(DEFAULT_FILING_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const canSync = connected && Boolean(email);
  // A local edit made before the cloud copy arrives must win, or connecting
  // would silently revert what the user just changed.
  const dirtyRef = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(keyFor(email));
      if (raw) setSettings(normalizeSettings(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
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

  useEffect(() => {
    if (!canSync || !email) return;
    (async () => {
      const remote = await fetchSettings(email);
      if (dirtyRef.current || !remote) await saveSettings(email, settings);
      else setSettings(remote);
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSync, email]);

  const update = useCallback(
    (patch: Partial<FilingSettings>) => {
      dirtyRef.current = true;
      setSettings((prev) => {
        const next = normalizeSettings({ ...prev, ...patch });
        if (canSync && email) saveSettings(email, next).catch(() => {});
        return next;
      });
    },
    [canSync, email]
  );

  return { settings, hydrated, update };
}
