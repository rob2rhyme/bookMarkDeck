"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchSettings, saveSettings } from "@/features/focus/data/focusData";
import {
  DEFAULT_SETTINGS,
  type FocusSettings,
  normalizeSettings,
} from "@/features/focus/lib/settings";
import { durableSave, pendingUpsertIds } from "@/utils/pendingDeletes";
import { untilAnswered } from "@/utils/untilAnswered";

const STORAGE_KEY = "bookmarkdeck:focus:settings:v1";
// A change not yet in the cloud is queued under this one id at once — before the
// debounce — so it outlives a reload or a tab closed inside the 600 ms.
const DOMAIN = "focusSettings";
const ID = "settings";

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
  // WHICH account's cache has loaded, not just whether one has. In the render
  // where the email arrives the state in hand is still the signed-out key's:
  // writing it then put that list over the account's cache, and a connect in the
  // same commit replayed from the clobbered copy and dropped what was queued.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const hydrated = loadedFor === (email ?? "");
  const canSync = connected && Boolean(email);

  // Whether the user changed settings this session, so connecting never
  // clobbers a fresh local change with stale remote (the queue covers reloads).
  const dirtyRef = useRef(false);

  // Load localStorage after mount.
  useEffect(() => {
    setSettings(loadLocal(email));
    setLoadedFor(email ?? "");
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

  // On connect: a local change still waiting for the cloud (queued, even from
  // before a reload) or made this session wins and goes up — otherwise adopt remote.
  useEffect(() => {
    if (!canSync || !email || !hydrated) return;
    let cancelled = false;
    const waiting = () => dirtyRef.current || pendingUpsertIds(DOMAIN, email).has(ID);
    const push = () => durableSave(DOMAIN, email, ID, () => saveSettings(email, loadLocal(email))).catch(() => {});
    if (waiting()) {
      push();
      return;
    }
    untilAnswered(() => fetchSettings(email), () => cancelled)
      .then((remote) => {
        if (cancelled) return;
        if (waiting()) push();
        else if (remote) setSettings(remote);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canSync, email, hydrated]);

  // Debounce writes so dragging a number field doesn't spam Firestore.
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistRemote = useCallback(
    (next: FocusSettings) => {
      if (!email) return; // no account yet: nothing to queue it under
      durableSave(DOMAIN, email, ID, null);
      if (!canSync) return;
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        durableSave(DOMAIN, email, ID, () => saveSettings(email, next)).catch(() => {});
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
