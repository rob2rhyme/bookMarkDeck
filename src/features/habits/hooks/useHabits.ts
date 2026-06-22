"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  deleteEntry,
  deleteHabit,
  fetchEntries,
  fetchHabits,
  saveEntry,
  saveHabit,
  subscribeEntries,
  subscribeHabits,
} from "@/features/habits/data/habitData";
import { addDays, todayKey } from "@/features/habits/lib/day";
import { coerceEntry, coerceHabit } from "@/features/habits/lib/serialize";
import { computeStats, isDueOn } from "@/features/habits/lib/streak";
import {
  type Habit,
  type HabitEntry,
  type HabitStats,
  habitTarget,
} from "@/features/habits/lib/types";

type LogActivity = (
  type: "habit_done" | "habit_skipped",
  summary: string
) => void;

const HKEY = "bookmarkdeck:habits:v1";
const EKEY = "bookmarkdeck:habit-entries:v1";

function keyFor(base: string, email?: string | null) {
  return email ? `${base}:${email}` : base;
}

function loadHabits(email?: string | null): Habit[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(HKEY, email));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((h) => coerceHabit(typeof h?.id === "string" ? h.id : "", h))
      .filter((h): h is Habit => h !== null && Boolean(h.id));
  } catch {
    return [];
  }
}

function loadEntries(email?: string | null): HabitEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(EKEY, email));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((e) => coerceEntry(typeof e?.id === "string" ? e.id : "", e))
      .filter((e): e is HabitEntry => e !== null);
  } catch {
    return [];
  }
}

export function useHabits(
  email?: string | null,
  connected = false,
  onLog?: LogActivity
) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [entries, setEntries] = useState<HabitEntry[]>([]);
  const [today, setToday] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const canSync = connected && Boolean(email);

  // Hydration-safe load (after mount only).
  useEffect(() => {
    setHabits(loadHabits(email));
    setEntries(loadEntries(email));
    setToday(todayKey());
    setHydrated(true);
  }, [email]);

  // Keep "today" fresh when the tab regains focus (covers crossing midnight).
  useEffect(() => {
    const onFocus = () => setToday(todayKey());
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  // Persist to localStorage.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(keyFor(HKEY, email), JSON.stringify(habits));
    } catch {}
  }, [habits, hydrated, email]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(keyFor(EKEY, email), JSON.stringify(entries));
    } catch {}
  }, [entries, hydrated, email]);

  // Seed cloud with local-only data, then subscribe for real-time updates.
  useEffect(() => {
    if (!canSync || !email) return;
    (async () => {
      try {
        // Seed local-only data so the first snapshot won't drop it. Entries are
        // bounded to the recent window — any pre-connect logging is necessarily
        // recent, and this avoids re-pushing a long history on every load.
        const recent = addDays(todayKey(), -14);
        await Promise.all(habits.map((h) => saveHabit(email, h)));
        await Promise.all(
          entries.filter((e) => e.day >= recent).map((e) => saveEntry(email, e))
        );
      } catch {}
    })();
    const unsubH = subscribeHabits(email, setHabits);
    const unsubE = subscribeEntries(email, setEntries);
    return () => {
      unsubH();
      unsubE();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSync, email]);

  const pullFromCloud = useCallback(async () => {
    if (!canSync || !email) return;
    const [h, e] = await Promise.all([fetchHabits(email), fetchEntries(email)]);
    setHabits(h);
    setEntries(e);
  }, [canSync, email]);

  /* ---------------------------------------------------------- entries --- */

  const upsertEntry = useCallback(
    (entry: HabitEntry) => {
      setEntries((prev) => {
        const next = prev.filter((e) => e.id !== entry.id);
        next.push(entry);
        return next;
      });
      if (canSync && email) saveEntry(email, entry).catch(() => {});
    },
    [canSync, email]
  );

  const removeEntry = useCallback(
    (id: string) => {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (canSync && email) deleteEntry(email, id).catch(() => {});
    },
    [canSync, email]
  );

  const entryId = (habitId: string, day: string) => `${habitId}_${day}`;
  const todayEntry = useCallback(
    (habitId: string) =>
      entries.find((e) => e.id === entryId(habitId, today)) ?? null,
    [entries, today]
  );

  /** Binary: toggle done/clear. Measurable: jump to target / clear. */
  const toggleToday = useCallback(
    (habit: Habit) => {
      if (!today) return;
      const existing = todayEntry(habit.id);
      const target = habitTarget(habit);
      const isDone = existing?.status === "done" && existing.count >= target;
      if (isDone) {
        removeEntry(entryId(habit.id, today));
        return;
      }
      const entry: HabitEntry = {
        id: entryId(habit.id, today),
        habitId: habit.id,
        day: today,
        status: "done",
        count: target,
        createdAt: new Date().toISOString(),
      };
      upsertEntry(entry);
      onLog?.("habit_done", `Completed habit: ${habit.name}`);
    },
    [today, todayEntry, upsertEntry, removeEntry, onLog]
  );

  /** Measurable +/- by a delta. Clears the entry at 0; logs when target met. */
  const adjustToday = useCallback(
    (habit: Habit, delta: number) => {
      if (!today) return;
      const existing = todayEntry(habit.id);
      const target = habitTarget(habit);
      const prevCount =
        existing && existing.status === "done" ? existing.count : 0;
      const wasDone = prevCount >= target;
      const count = Math.max(0, prevCount + delta);
      if (count === 0) {
        removeEntry(entryId(habit.id, today));
        return;
      }
      upsertEntry({
        id: entryId(habit.id, today),
        habitId: habit.id,
        day: today,
        status: "done",
        count,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      });
      if (!wasDone && count >= target)
        onLog?.("habit_done", `Completed habit: ${habit.name}`);
    },
    [today, todayEntry, upsertEntry, removeEntry, onLog]
  );

  const skipToday = useCallback(
    (habit: Habit) => {
      if (!today) return;
      upsertEntry({
        id: entryId(habit.id, today),
        habitId: habit.id,
        day: today,
        status: "skipped",
        count: 0,
        createdAt: new Date().toISOString(),
      });
      onLog?.("habit_skipped", `Skipped habit: ${habit.name}`);
    },
    [today, upsertEntry, onLog]
  );

  const clearToday = useCallback(
    (habit: Habit) => {
      if (!today) return;
      removeEntry(entryId(habit.id, today));
    },
    [today, removeEntry]
  );

  /* ----------------------------------------------------------- habits --- */

  const addHabit = useCallback(
    (habit: Habit) => {
      setHabits((prev) => [...prev, habit]);
      if (canSync && email) saveHabit(email, habit).catch(() => {});
    },
    [canSync, email]
  );

  const updateHabit = useCallback(
    (habit: Habit) => {
      setHabits((prev) => prev.map((h) => (h.id === habit.id ? habit : h)));
      if (canSync && email) saveHabit(email, habit).catch(() => {});
    },
    [canSync, email]
  );

  const removeHabit = useCallback(
    (id: string) => {
      setHabits((prev) => prev.filter((h) => h.id !== id));
      if (canSync && email) deleteHabit(email, id).catch(() => {});
    },
    [canSync, email]
  );

  const setArchived = useCallback(
    (id: string, archived: boolean) => {
      setHabits((prev) => {
        const next = prev.map((h) => (h.id === id ? { ...h, archived } : h));
        const target = next.find((h) => h.id === id);
        if (canSync && email && target) saveHabit(email, target).catch(() => {});
        return next;
      });
    },
    [canSync, email]
  );

  const reorder = useCallback(
    (orderedIds: string[]) => {
      setHabits((prev) => {
        const next = prev.map((h) => {
          const idx = orderedIds.indexOf(h.id);
          return idx === -1 ? h : { ...h, sortOrder: idx };
        });
        if (canSync && email) {
          for (const id of orderedIds) {
            const t = next.find((h) => h.id === id);
            if (t) saveHabit(email, t).catch(() => {});
          }
        }
        return next;
      });
    },
    [canSync, email]
  );

  /* ----------------------------------------------------- derived data --- */

  const sorted = useMemo(
    () => [...habits].sort((a, b) => a.sortOrder - b.sortOrder),
    [habits]
  );
  const active = useMemo(() => sorted.filter((h) => !h.archived), [sorted]);
  const archived = useMemo(() => sorted.filter((h) => h.archived), [sorted]);

  const statsByHabit = useMemo(() => {
    const map = new Map<string, HabitStats>();
    if (!today) return map;
    for (const h of habits) map.set(h.id, computeStats(h, entries, today));
    return map;
  }, [habits, entries, today]);

  // Heatmap counts: successful completions per day across known habits only
  // (orphaned entries from deleted habits are ignored).
  const dayCounts = useMemo(() => {
    const ids = new Set(habits.map((h) => h.id));
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (e.status !== "done" || !ids.has(e.habitId)) continue;
      counts.set(e.day, (counts.get(e.day) ?? 0) + 1);
    }
    return counts;
  }, [entries, habits]);

  const dueToday = useMemo(
    () => active.filter((h) => (today ? isDueOn(h, today) : false)),
    [active, today]
  );
  const doneTodayCount = useMemo(
    () =>
      dueToday.filter((h) => statsByHabit.get(h.id)?.doneToday).length,
    [dueToday, statsByHabit]
  );

  return {
    hydrated,
    today,
    habits: active,
    archived,
    allHabits: sorted,
    entries,
    statsByHabit,
    dayCounts,
    dueToday,
    doneTodayCount,
    toggleToday,
    adjustToday,
    skipToday,
    clearToday,
    todayEntry,
    addHabit,
    updateHabit,
    removeHabit,
    setArchived,
    reorder,
    pullFromCloud,
  };
}
