"use client";

// The opt-in daily My Stuff reminder push — Filing's digest design, on the same
// push path (see useFilingPush.ts and lib/digest.ts for the reasoning and the
// 24-hour limit). The previous message is cancelled before a new one is
// scheduled, and the digest is fingerprinted so an unchanged dashboard doesn't
// churn a fresh QStash message on every render.

import { useCallback, useEffect, useRef } from "react";

import { cancelPush, schedulePush, usePushPermission } from "@/lib/push";
import { msUntilHour } from "@/lib/msUntilHour";
import { buildInventoryDigest } from "@/features/inventory/lib/digest";
import type { Attention } from "@/features/inventory/lib/value";

const MESSAGE_KEY = "bookmarkdeck:inventory:push-message:v1";

const keyFor = (email?: string | null) => (email ? `${MESSAGE_KEY}:${email}` : MESSAGE_KEY);

function readMessageId(email?: string | null): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(keyFor(email));
  } catch {
    return null;
  }
}

function writeMessageId(email: string | null | undefined, id: string | null) {
  try {
    if (id) window.localStorage.setItem(keyFor(email), id);
    else window.localStorage.removeItem(keyFor(email));
  } catch {
    /* ignore */
  }
}

/**
 * Keep at most one scheduled digest per device. A no-op when push isn't
 * configured or this device hasn't granted permission — `enabled` syncs across
 * devices and this effect runs on every visit, so it must never be what asks:
 * the settings dialog's checkbox and button do that.
 */
export function useInventoryPush({
  email,
  enabled,
  hour,
  attention,
  nameItems = true,
  ready,
}: {
  email?: string | null;
  enabled: boolean;
  hour: number;
  attention: Attention;
  /** False when the app is PIN-locked: counts only, no item names in a notification. */
  nameItems?: boolean;
  /** Hold off until items and today's date are known, or the first digest is empty. */
  ready: boolean;
}) {
  const lastFingerprint = useRef<string | null>(null);
  const permission = usePushPermission();

  const clear = useCallback(async () => {
    const id = readMessageId(email);
    if (id) {
      writeMessageId(email, null);
      await cancelPush(id);
    }
    lastFingerprint.current = null;
  }, [email]);

  useEffect(() => {
    if (!ready) return;

    if (!enabled) {
      void clear();
      return;
    }
    if (permission !== "granted") return;

    const digest = buildInventoryDigest(attention, nameItems ? 3 : 0);
    // Nothing to say: cancel rather than send "0 things need attention".
    if (digest.count === 0) {
      void clear();
      return;
    }

    const fingerprint = `${hour}|${digest.title}|${digest.body}`;
    if (fingerprint === lastFingerprint.current) return;

    let cancelled = false;
    (async () => {
      const previous = readMessageId(email);
      if (previous) {
        writeMessageId(email, null);
        await cancelPush(previous);
      }
      if (cancelled) return;
      const id = await schedulePush({
        endTime: Date.now() + msUntilHour(new Date(), hour),
        title: digest.title,
        body: digest.body,
        url: "/inventory",
        tag: "inventory-digest",
      });
      if (cancelled) {
        // The effect re-ran mid-flight; don't leave an orphan queued.
        await cancelPush(id);
        return;
      }
      writeMessageId(email, id);
      lastFingerprint.current = id ? fingerprint : null;
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [ready, enabled, permission, hour, attention, nameItems, email, clear]);

  return { clear };
}
