"use client";

import { useEffect, useState } from "react";

import { subscribeContent } from "@/features/focus/data/focusData";
import {
  DEFAULT_CONTENT,
  type FocusContent,
  mergeContent,
} from "@/features/focus/lib/content";

/**
 * Inspirational content for the "Need a push?" card. Always starts from the
 * built-in defaults (instant, offline-safe); when connected, live-merges any
 * per-user extras stored in Firestore (users/{uid}/focusContent/content).
 */
export function useFocusContent(
  email?: string | null,
  connected = false
): FocusContent {
  const [content, setContent] = useState<FocusContent>(DEFAULT_CONTENT);
  const canSync = connected && Boolean(email);

  useEffect(() => {
    if (!canSync || !email) {
      setContent(DEFAULT_CONTENT);
      return;
    }
    return subscribeContent(email, (extra) => setContent(mergeContent(extra)));
  }, [canSync, email]);

  return content;
}
