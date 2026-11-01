"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { X } from "@/components/icons";
import { subscribeSessions } from "@/features/focus/data/focusData";
import { auth } from "@/lib/firebase";
import { readNoteDates } from "@/lib/notesIndex";
import { computeWeeklyRecap, formatMinutes, recapWeeks, type RecapSources } from "@/lib/weeklyRecap";
import type { Bookmark } from "@/types/bookmark";

// Each pillar's device cache, read rather than mounting the hook that owns it
// (as the nav badges do). storageKeys.test.ts holds these copies to their owners.
const HABIT_ENTRIES_KEY = "bookmarkdeck:habit-entries:v1";
const ITEMS_KEY = "bookmarkdeck:inventory:items:v1";
// The week the card was hidden for, per device; it comes back the next Monday.
const HIDDEN_KEY = "bd:recap:hidden:v1";

function readList(base: string, email: string): unknown[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${base}:${email}`) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const asStr = (v: unknown) => (typeof v === "string" ? v : null);

type Local = {
  now: Date;
  hiddenWeek: string | null;
  habitEntries: RecapSources["habitEntries"];
  notes: RecapSources["notes"];
  items: RecapSources["items"];
};

function readLocal(email: string): Local {
  let hiddenWeek: string | null = null;
  try {
    hiddenWeek = window.localStorage.getItem(HIDDEN_KEY);
  } catch {
    /* storage blocked: the card simply shows */
  }
  return {
    now: new Date(),
    hiddenWeek,
    habitEntries: readList(HABIT_ENTRIES_KEY, email).flatMap((e) => {
      const r = e as Record<string, unknown>;
      const day = asStr(r?.day);
      const status = asStr(r?.status);
      return day && status ? [{ day, status }] : [];
    }),
    notes: readNoteDates(email),
    items: readList(ITEMS_KEY, email).map((i) => ({ createdAt: asStr((i as Record<string, unknown>)?.createdAt) })),
  };
}

/**
 * "Your week" on the home page: this week so far beside last week, one row per
 * pillar with something to show. Computed on the device from what's already
 * there and stored nowhere. Focus time appears once cloud sync is connected —
 * sessions live only in the cloud — and the card never starts a sign-in itself.
 */
export function WeeklyRecapCard({ email, bookmarks }: { email: string | null; bookmarks: Bookmark[] }) {
  const [local, setLocal] = useState<Local | null>(null);
  const [sessions, setSessions] = useState<RecapSources["focusSessions"]>(null);

  // Device caches: read after mount (hydration-safe), again on return to the tab.
  useEffect(() => {
    if (!email) return;
    const refresh = () => setLocal(readLocal(email));
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [email]);

  // Focus sessions, only over a Firebase session that already exists for this
  // account: subscribeSessions would otherwise open a sign-in popup.
  useEffect(() => {
    if (!email) return;
    let unsub: (() => void) | null = null;
    const stopAuth = onAuthStateChanged(auth, (user) => {
      unsub?.();
      unsub = null;
      if (user?.email && user.email.toLowerCase() === email.toLowerCase()) {
        unsub = subscribeSessions(email, (rows) => setSessions(rows));
      } else {
        setSessions(null);
      }
    });
    return () => {
      stopAuth();
      unsub?.();
    };
  }, [email]);

  const rows = useMemo(
    () =>
      local
        ? computeWeeklyRecap(
            {
              focusSessions: sessions,
              habitEntries: local.habitEntries,
              bookmarks,
              notes: local.notes,
              items: local.items,
            },
            local.now
          )
        : [],
    [local, sessions, bookmarks]
  );

  if (!local || rows.length === 0) return null;
  const week = recapWeeks(local.now).thisWeek.start;
  if (local.hiddenWeek === week) return null;

  const hide = () => {
    try {
      window.localStorage.setItem(HIDDEN_KEY, week);
    } catch {
      /* can't remember it: hide for this visit only */
    }
    setLocal({ ...local, hiddenWeek: week });
  };
  const show = (n: number, unit: "minutes" | "count") => (unit === "minutes" ? formatMinutes(n) : String(n));

  return (
    <section
      aria-label="Your week"
      className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Your week</p>
          <p className="mt-0.5 text-xs text-slate-500">Since Monday, beside last week</p>
        </div>
        <button
          type="button"
          onClick={hide}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
          aria-label="Hide until next week"
          title="Hide until next week"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500">
            <th scope="col" className="pb-1 text-left font-normal">
              <span className="sr-only">Pillar</span>
            </th>
            <th scope="col" className="pb-1 text-right font-normal">This week</th>
            <th scope="col" className="pb-1 pl-3 text-right font-normal">Last week</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-slate-800/70">
              <th scope="row" className="py-2 text-left font-normal">
                <Link href={r.href} className="text-slate-200 hover:text-blue-300">
                  {r.label}
                </Link>
                {r.detail && <span className="block text-xs text-slate-500">{r.detail}</span>}
              </th>
              <td className="py-2 text-right font-semibold tabular-nums text-slate-50">{show(r.thisWeek, r.unit)}</td>
              <td className="py-2 pl-3 text-right tabular-nums text-slate-400">{show(r.lastWeek, r.unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
