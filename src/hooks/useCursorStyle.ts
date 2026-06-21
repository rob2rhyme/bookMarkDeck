"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "@/lib/firebase";
import { fetchSettings } from "@/features/focus/data/focusData";
import {
  type CursorStyle,
  isCursorStyle,
} from "@/features/focus/lib/settings";

// Same localStorage key the focus settings write to, so the cursor preference is
// read app-wide (header → cursor) without coupling to the focus page lifecycle.
const STORAGE_KEY = "bookmarkdeck:focus:settings:v1";
const CURSOR_EVENT = "bd:cursor-style";

function keyFor(email?: string | null) {
  return email ? `${STORAGE_KEY}:${email}` : STORAGE_KEY;
}

function readLocal(email?: string | null): CursorStyle {
  if (typeof window === "undefined") return "dragon";
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    if (!raw) return "dragon";
    const parsed = JSON.parse(raw);
    return isCursorStyle(parsed?.cursorStyle) ? parsed.cursorStyle : "dragon";
  } catch {
    return "dragon";
  }
}

/** Broadcast an immediate (same-tab) cursor-style change to any live overlay. */
export function broadcastCursorStyle(style: CursorStyle) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CURSOR_EVENT, { detail: style }));
}

/**
 * App-wide cursor overlay preference. Starts from the built-in default
 * (hydration-safe), reflects the localStorage cache after mount, updates live on
 * same-tab changes (custom event) and other tabs (storage event), and reflects
 * the account-synced value once a Firebase session is present (cross-device).
 */
export function useCursorStyle(email?: string | null): CursorStyle {
  const [style, setStyle] = useState<CursorStyle>("dragon");

  useEffect(() => {
    setStyle(readLocal(email));

    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (isCursorStyle(detail)) setStyle(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === keyFor(email)) setStyle(readLocal(email));
    };
    window.addEventListener(CURSOR_EVENT, onCustom as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CURSOR_EVENT, onCustom as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [email]);

  // Cross-device: once a Firebase session exists, adopt the synced value.
  useEffect(() => {
    if (!email) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      fetchSettings(email)
        .then((remote) => {
          if (remote && isCursorStyle(remote.cursorStyle)) {
            setStyle(remote.cursorStyle);
          }
        })
        .catch(() => {});
    });
    return unsub;
  }, [email]);

  return style;
}
