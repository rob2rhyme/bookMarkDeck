"use client";

// The opt-in daily digest push (ANALYSIS-FILING-LOG.md §6, Phase 5).
//
// This rides the push path Focus already ships — /api/push/schedule → QStash →
// /api/push/fire → sw.js — rather than adding infrastructure. That path clamps
// delays to 24 hours, which is why a filing reminder is one digest a day rather
// than an alarm per obligation; see lib/digest.ts for the reasoning and the
// limitation it implies.
//
// Re-arming is idempotent by construction: the previous message is cancelled
// before a new one is scheduled, and the digest's content is fingerprinted so an
// unchanged dashboard doesn't churn a fresh QStash message on every render.

import { useCallback, useEffect, useRef } from "react";

import { cancelPush, schedulePush } from "@/features/filing/lib/push";
import { buildDigest, msUntilHour } from "@/features/filing/lib/digest";
import type { CustodyItem } from "@/features/filing/lib/custody";
import type { DueItem } from "@/features/filing/lib/obligations";
import type { ShredItem } from "@/features/filing/lib/retention";

const MESSAGE_KEY = "bookmarkdeck:filing:push-message:v1";

const keyFor = (email?: string | null) =>
  email ? `${MESSAGE_KEY}:${email}` : MESSAGE_KEY;

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
 * Keep at most one scheduled digest per device.
 *
 * `enabled` is the user's setting; `hour` is when they want it. Everything
 * degrades to a no-op when push isn't configured or permission is refused — the
 * in-app panel and the nav badge are the reliable surface, this is a convenience
 * on top.
 */
export function useFilingPush({
  email,
  enabled,
  hour,
  due,
  shred,
  custody,
  ready,
}: {
  email?: string | null;
  enabled: boolean;
  hour: number;
  due: DueItem[];
  shred: ShredItem[];
  custody: CustodyItem[];
  /** Hold off until the data has actually loaded, or the first digest is empty. */
  ready: boolean;
}) {
  // What we last scheduled, so an unchanged dashboard doesn't reschedule.
  const lastFingerprint = useRef<string | null>(null);

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

    const digest = buildDigest(due, shred, custody);
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
        url: "/filing",
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
  }, [ready, enabled, hour, due, shred, custody, email, clear]);

  return { clear };
}
