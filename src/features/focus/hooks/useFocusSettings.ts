"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchSettings, saveSettings } from "@/features/focus/data/focusData";
import {
  DEFAULT_SETTINGS,
  type FocusSettings,
  normalizeSettings,
} from "@/features/focus/lib/settings";

const STORAGE_KEY = "bookmarkdeck:focus:settings:v1";

function storageKeyFor(email?: string | null) {
  return email ? `${STORAGE_KEY}:${email}` : STORAGE_KEY;
}

function loadLocal(email?: string | null): FocusSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(storageKeyFor(email));
    return raw ? normalizeSettings(JSON.parse(raw)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Focus settings: deterministic defaults on first render (hydration-safe),
 * loaded from localStorage after mount, and synced to Firestore when connected.
 */
export function useFocusSettings(email?: string | null, connected = false) {
  const [settings, setSettings] = useState<FocusSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const canSync = connected && Boolean(email);

  // Track latest settings + whether the user changed them before connecting,
  // so connecting never clobbers a fresh local change with stale remote.
  const settingsRef = useRef(settings);
  const dirtyRef = useRef(false);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Load localStorage after mount.
  useEffect(() => {
    setSettings(loadLocal(email));
    setHydrated(true);
  }, [email]);

  // Persist to localStorage after hydration.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        storageKeyFor(email),
        JSON.stringify(settings)
      );
    } catch {}
  }, [settings, hydrated, email]);

  // On connect: if the user already changed settings locally this session, push
  // those up (local wins) instead of pulling — otherwise adopt remote.
  useEffect(() => {
    if (!canSync || !email) return;
    let cancelled = false;
    if (dirtyRef.current) {
      saveSettings(email, settingsRef.current).catch(() => {});
      return;
    }
    fetchSettings(email)
      .then((remote) => {
        if (!cancelled && remote && !dirtyRef.current) setSettings(remote);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canSync, email]);

  // Debounce writes so dragging a number field doesn't spam Firestore.
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistRemote = useCallback(
    (next: FocusSettings) => {
      if (!canSync || !email) return;
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        saveSettings(email, next).catch(() => {});
      }, 600);
    },
    [canSync, email]
  );

  const update = useCallback(
    (patch: Partial<FocusSettings>) => {
      dirtyRef.current = true;
      setSettings((prev) => {
        const next = normalizeSettings({ ...prev, ...patch });
        persistRemote(next);
        return next;
      });
    },
    [persistRemote]
  );

  const reset = useCallback(() => {
    dirtyRef.current = true;
    setSettings(DEFAULT_SETTINGS);
    persistRemote(DEFAULT_SETTINGS);
  }, [persistRemote]);

  const pullFromCloud = useCallback(async () => {
    if (!canSync || !email) return;
    const remote = await fetchSettings(email);
    if (remote) setSettings(remote);
  }, [canSync, email]);

  const pushToCloud = useCallback(async () => {
    if (!canSync || !email) return;
    await saveSettings(email, settings);
  }, [canSync, email, settings]);

  return { settings, update, reset, hydrated, pullFromCloud, pushToCloud };
}
