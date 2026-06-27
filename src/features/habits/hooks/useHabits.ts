"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import {
  saveHydration,
  subscribeHydration,
} from "@/features/focus/data/focusData";
import { todayKey } from "@/features/habits/lib/day";
import { coerceEntry, coerceHabit } from "@/features/habits/lib/serialize";
import {
  clearPendingUpserts,
  flushPendingDeletes,
  pendingUpsertIds,
  queueDelete,
  queueUpsert,
  unqueueUpsert,
} from "@/utils/pendingDeletes";
import { computeStats, isDueOn } from "@/features/habits/lib/streak";
import {
  getFocusHydrationCache,
  getFocusWaterGoal,
  isWaterHabit,
  setFocusHydrationCache,
} from "@/features/habits/lib/water";
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
  // True once the cloud has had its say (first snapshot, or a timeout if no
  // session) — so callers don't mistake "still loading" for "user has no data".
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const canSync = connected && Boolean(email);

  // Latest entries, readable from callbacks/subscriptions without re-binding.
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Per-habit single-step undo: the today-entry that existed just before the
  // most recent tap (null = there was none). Set on every logging action,
  // consumed by undoToday, and reset when the day rolls over.
  const [undoByHabit, setUndoByHabit] = useState<Map<string, HabitEntry | null>>(
    () => new Map()
  );

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

  // Gate "cloud has loaded": a logged-in user's habits may live only in the
  // cloud, so wait for the first snapshot before judging them habit-less. Fall
  // back after a few seconds if no Firebase session ever connects.
  useEffect(() => {
    if (!email) {
      setCloudLoaded(true);
      return;
    }
    setCloudLoaded(false);
    const t = setTimeout(() => setCloudLoaded(true), 4000);
    return () => clearTimeout(t);
  }, [email]);

  // On connect: replay offline deletes and push ONLY what changed while offline
  // (pending upserts), then subscribe. Never blanket re-upload the whole local
  // cache — that clobbers newer cloud edits (e.g. a habit's direction) with a
  // stale local copy from another device/tab/session.
  useEffect(() => {
    if (!canSync || !email) return;
    let cancelled = false;
    let unsubH = () => {};
    let unsubE = () => {};
    (async () => {
      await flushPendingDeletes("habits", email, (id) => deleteHabit(email, id));
      await flushPendingDeletes("habitEntries", email, (id) =>
        deleteEntry(email, id)
      );
      const hUps = pendingUpsertIds("habits", email);
      if (hUps.size)
        await Promise.all(
          habits
            .filter((h) => hUps.has(h.id))
            .map((h) => saveHabit(email, h).catch(() => {}))
        );
      const eUps = pendingUpsertIds("habitEntries", email);
      if (eUps.size)
        await Promise.all(
          entries
            .filter((e) => eUps.has(e.id))
            .map((e) => saveEntry(email, e).catch(() => {}))
        );
      clearPendingUpserts("habits", email);
      clearPendingUpserts("habitEntries", email);
    })()
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        unsubH = subscribeHabits(email, (h) => {
          setHabits(h);
          setCloudLoaded(true);
        });
        unsubE = subscribeEntries(email, setEntries);
      });
    return () => {
      cancelled = true;
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
      else queueUpsert("habitEntries", email, entry.id);
    },
    [canSync, email]
  );

  const removeEntry = useCallback(
    (id: string) => {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (canSync && email) deleteEntry(email, id).catch(() => {});
      else {
        queueDelete("habitEntries", email, id);
        unqueueUpsert("habitEntries", email, id);
      }
    },
    [canSync, email]
  );

  const entryId = (habitId: string, day: string) => `${habitId}_${day}`;
  const todayEntry = useCallback(
    (habitId: string) =>
      entries.find((e) => e.id === entryId(habitId, today)) ?? null,
    [entries, today]
  );

  // Forget pending undos when the day changes (yesterday's snapshot is moot).
  useEffect(() => {
    setUndoByHabit(new Map());
  }, [today]);

  // Snapshot today's entry (or null) right before mutating it, so a single tap
  // can be reverted exactly.
  const recordUndo = useCallback(
    (habitId: string) => {
      const prev =
        entriesRef.current.find((e) => e.id === entryId(habitId, today)) ?? null;
      setUndoByHabit((m) => {
        const next = new Map(m);
        next.set(habitId, prev);
        return next;
      });
    },
    [today]
  );

  // Push a water habit's today count to Focus hydration (1 cup = 1 count). The
  // localStorage write keeps Focus current even offline; the Firestore write
  // syncs across devices/surfaces. No-op for non-water habits.
  const mirrorWater = useCallback(
    (habit: Habit, cups: number) => {
      if (!isWaterHabit(habit) || !today) return;
      const v = Math.max(0, Math.round(cups));
      setFocusHydrationCache(email, v);
      if (canSync && email) saveHydration(email, today, v).catch(() => {});
    },
    [canSync, email, today]
  );

  /** Binary: toggle done/clear. Measurable: jump to target / clear. */
  const toggleToday = useCallback(
    (habit: Habit) => {
      if (!today) return;
      recordUndo(habit.id);
      const existing = todayEntry(habit.id);
      const target = habitTarget(habit);
      const isDone = existing?.status === "done" && existing.count >= target;
      if (isDone) {
        removeEntry(entryId(habit.id, today));
        mirrorWater(habit, 0);
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
      mirrorWater(habit, target);
      onLog?.("habit_done", `Completed habit: ${habit.name}`);
    },
    [today, todayEntry, upsertEntry, removeEntry, onLog, recordUndo, mirrorWater]
  );

  /** Measurable +/- by a delta. Clears the entry at 0; logs when target met. */
  const adjustToday = useCallback(
    (habit: Habit, delta: number) => {
      if (!today) return;
      recordUndo(habit.id);
      const existing = todayEntry(habit.id);
      const target = habitTarget(habit);
      const prevCount =
        existing && existing.status === "done" ? existing.count : 0;
      const wasDone = prevCount >= target;
      const count = Math.max(0, prevCount + delta);
      if (count === 0) {
        removeEntry(entryId(habit.id, today));
        mirrorWater(habit, 0);
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
      mirrorWater(habit, count);
      if (!wasDone && count >= target)
        onLog?.("habit_done", `Completed habit: ${habit.name}`);
    },
    [today, todayEntry, upsertEntry, removeEntry, onLog, recordUndo, mirrorWater]
  );

  const skipToday = useCallback(
    (habit: Habit) => {
      if (!today) return;
      recordUndo(habit.id);
      upsertEntry({
        id: entryId(habit.id, today),
        habitId: habit.id,
        day: today,
        status: "skipped",
        count: 0,
        createdAt: new Date().toISOString(),
      });
      mirrorWater(habit, 0);
      onLog?.("habit_skipped", `Skipped habit: ${habit.name}`);
    },
    [today, upsertEntry, onLog, recordUndo, mirrorWater]
  );

  const clearToday = useCallback(
    (habit: Habit) => {
      if (!today) return;
      removeEntry(entryId(habit.id, today));
      mirrorWater(habit, 0);
    },
    [today, removeEntry, mirrorWater]
  );

  /** Remove a habit's entry for any day (e.g. an accidental log in history). */
  const clearEntryFor = useCallback(
    (habit: Habit, day: string) => {
      if (!day) return;
      removeEntry(entryId(habit.id, day));
      if (day === today) mirrorWater(habit, 0);
    },
    [today, removeEntry, mirrorWater]
  );

  /**
   * Log (or clear) a habit for ANY day — the basis for backfilling past dates.
   * Mirrors logDetail's rules but is day-parameterized; water mirroring + the
   * today-only activity log are skipped for past days (handled on `today`).
   */
  const logEntryFor = useCallback(
    (
      habit: Habit,
      day: string,
      detail: {
        status: "done" | "skipped" | "clear";
        count?: number;
        note?: string;
        at?: string | null;
      }
    ) => {
      if (!day) return;
      const id = entryId(habit.id, day);
      if (detail.status === "clear") {
        removeEntry(id);
        if (day === today) mirrorWater(habit, 0);
        return;
      }
      const target = habitTarget(habit);
      const prev = entriesRef.current.find((e) => e.id === id) ?? null;
      const count =
        detail.status === "skipped"
          ? 0
          : Math.max(1, Math.round(detail.count ?? prev?.count ?? target));
      const note = detail.note?.trim();
      upsertEntry({
        id,
        habitId: habit.id,
        day,
        status: detail.status,
        count,
        ...(note ? { note } : {}),
        ...(detail.at ? { at: detail.at } : {}),
        createdAt: prev?.createdAt ?? new Date().toISOString(),
      });
      if (day === today) mirrorWater(habit, detail.status === "done" ? count : 0);
    },
    [today, upsertEntry, removeEntry, mirrorWater]
  );

  /** Revert the most recent tap on a habit to the snapshot taken before it. */
  const undoToday = useCallback(
    (habit: Habit) => {
      if (!today) return;
      const prev = undoByHabit.get(habit.id);
      if (prev === undefined) return; // nothing recorded
      if (prev === null) removeEntry(entryId(habit.id, today));
      else upsertEntry(prev);
      mirrorWater(
        habit,
        prev && prev.status === "done" ? prev.count : 0
      );
      setUndoByHabit((m) => {
        const next = new Map(m);
        next.delete(habit.id);
        return next;
      });
    },
    [today, undoByHabit, removeEntry, upsertEntry, mirrorWater]
  );

  /** Full "log today" editor: set status/count + optional note & clock time. */
  const logDetail = useCallback(
    (
      habit: Habit,
      detail: {
        status: "done" | "skipped" | "clear";
        count?: number;
        note?: string;
        at?: string | null;
      }
    ) => {
      if (!today) return;
      recordUndo(habit.id);
      if (detail.status === "clear") {
        removeEntry(entryId(habit.id, today));
        mirrorWater(habit, 0);
        return;
      }
      const target = habitTarget(habit);
      const prev = todayEntry(habit.id);
      const wasDone = prev?.status === "done" && prev.count >= target;
      const count =
        detail.status === "skipped"
          ? 0
          : Math.max(1, Math.round(detail.count ?? prev?.count ?? target));
      const note = detail.note?.trim();
      upsertEntry({
        id: entryId(habit.id, today),
        habitId: habit.id,
        day: today,
        status: detail.status,
        count,
        ...(note ? { note } : {}),
        ...(detail.at ? { at: detail.at } : {}),
        createdAt: prev?.createdAt ?? new Date().toISOString(),
      });
      mirrorWater(habit, detail.status === "done" ? count : 0);
      if (detail.status === "done" && !wasDone)
        onLog?.("habit_done", `Completed habit: ${habit.name}`);
      if (detail.status === "skipped" && prev?.status !== "skipped")
        onLog?.("habit_skipped", `Skipped habit: ${habit.name}`);
    },
    [today, todayEntry, upsertEntry, removeEntry, onLog, recordUndo, mirrorWater]
  );

  /* ----------------------------------------------------------- habits --- */

  const addHabit = useCallback(
    (habit: Habit) => {
      setHabits((prev) => [...prev, habit]);
      if (canSync && email) saveHabit(email, habit).catch(() => {});
      else queueUpsert("habits", email, habit.id);
    },
    [canSync, email]
  );

  /**
   * Merge imported habits + entries (from a JSON backup) into the tracker,
   * non-destructively: anything whose id already exists is skipped, so a restore
   * never overwrites current data. New records persist to the cloud when synced.
   * Returns counts for a confirmation/result message.
   */
  const importData = useCallback(
    (inHabits: Habit[], inEntries: HabitEntry[]) => {
      const haveH = new Set(habits.map((h) => h.id));
      const newH = inHabits.filter((h) => !haveH.has(h.id));
      const haveE = new Set(entries.map((e) => e.id));
      const newE = inEntries.filter((e) => !haveE.has(e.id));

      if (newH.length)
        setHabits((prev) => {
          const ids = new Set(prev.map((h) => h.id));
          return [...prev, ...newH.filter((h) => !ids.has(h.id))];
        });
      if (newE.length)
        setEntries((prev) => {
          const ids = new Set(prev.map((e) => e.id));
          return [...prev, ...newE.filter((e) => !ids.has(e.id))];
        });
      if (canSync && email) {
        newH.forEach((h) => saveHabit(email, h).catch(() => {}));
        newE.forEach((e) => saveEntry(email, e).catch(() => {}));
      } else {
        newH.forEach((h) => queueUpsert("habits", email, h.id));
        newE.forEach((e) => queueUpsert("habitEntries", email, e.id));
      }
      return {
        addedHabits: newH.length,
        addedEntries: newE.length,
        skipped:
          inHabits.length - newH.length + (inEntries.length - newE.length),
      };
    },
    [habits, entries, canSync, email]
  );

  const updateHabit = useCallback(
    (habit: Habit) => {
      setHabits((prev) => prev.map((h) => (h.id === habit.id ? habit : h)));
      if (canSync && email) saveHabit(email, habit).catch(() => {});
      else queueUpsert("habits", email, habit.id);
    },
    [canSync, email]
  );

  const removeHabit = useCallback(
    (id: string) => {
      setHabits((prev) => prev.filter((h) => h.id !== id));
      if (canSync && email) deleteHabit(email, id).catch(() => {});
      else {
        queueDelete("habits", email, id);
        unqueueUpsert("habits", email, id);
      }
    },
    [canSync, email]
  );

  const setArchived = useCallback(
    (id: string, archived: boolean) => {
      setHabits((prev) => {
        const next = prev.map((h) => (h.id === id ? { ...h, archived } : h));
        const target = next.find((h) => h.id === id);
        if (canSync && email && target) saveHabit(email, target).catch(() => {});
        else if (target) queueUpsert("habits", email, id);
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
        for (const id of orderedIds) {
          const t = next.find((h) => h.id === id);
          if (!t) continue;
          if (canSync && email) saveHabit(email, t).catch(() => {});
          else queueUpsert("habits", email, id);
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

  // The linked water habit (first active match), if any. Kept in a ref so the
  // hydration subscription can read the latest without re-subscribing.
  const waterHabit = useMemo(() => active.find(isWaterHabit) ?? null, [active]);
  const waterHabitRef = useRef(waterHabit);
  useEffect(() => {
    waterHabitRef.current = waterHabit;
  }, [waterHabit]);

  // Reverse mirror: reflect Focus hydration (logged on the Focus page) into the
  // water habit's today entry. First snapshot max-merges (so neither surface's
  // value is lost); later snapshots adopt the remote count. Writing the entry
  // here never re-triggers mirrorWater, so there's no loop.
  useEffect(() => {
    if (!canSync || !email || !waterHabit || !today) return;
    const day = today;
    const habitId = waterHabit.id;
    let first = true;
    return subscribeHydration(email, day, (remote) => {
      const wh = waterHabitRef.current;
      if (!wh || wh.id !== habitId) return;
      const id = `${habitId}_${day}`;
      const cur = entriesRef.current.find((e) => e.id === id);
      const curCount = cur && cur.status === "done" ? cur.count : 0;

      // No hydration doc yet: seed it from the habit's count on first snapshot.
      if (remote == null) {
        if (first) {
          first = false;
          if (curCount > 0) saveHydration(email, day, curCount).catch(() => {});
        }
        return;
      }

      // First snapshot max-merges so neither surface's value is lost; later
      // snapshots adopt the remote count.
      const resolved = first ? Math.max(curCount, remote) : remote;
      first = false;

      if (resolved !== curCount) {
        if (resolved <= 0) {
          removeEntry(id);
        } else {
          upsertEntry({
            id,
            habitId,
            day,
            status: "done",
            count: resolved,
            createdAt: cur?.createdAt ?? new Date().toISOString(),
          });
        }
      }
      // If the merge raised the value above what Focus had, push it back up.
      if (resolved !== remote) saveHydration(email, day, resolved).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSync, email, waterHabit?.id, today]);

  // Offline/no-sync path: seed the water habit's today count from Focus's local
  // hydration cache so cups logged on the Focus page show up here too. Only ever
  // raises the count (max-merge), so it won't wipe a higher habit value.
  useEffect(() => {
    if (!hydrated || !waterHabit || !today) return;
    const cached = getFocusHydrationCache(email);
    if (cached == null || cached <= 0) return;
    const id = entryId(waterHabit.id, today);
    const cur = entriesRef.current.find((e) => e.id === id);
    const curCount = cur && cur.status === "done" ? cur.count : 0;
    if (cached > curCount) {
      upsertEntry({
        id,
        habitId: waterHabit.id,
        day: today,
        status: "done",
        count: cached,
        createdAt: cur?.createdAt ?? new Date().toISOString(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, waterHabit?.id, today]);

  // Keep the water habit's daily target in lock-step with the Focus hydration
  // goal (its single source of truth), so both pages show the same "/N cups".
  useEffect(() => {
    if (!hydrated || !waterHabit) return;
    const goal = getFocusWaterGoal(email);
    if (goal == null || goal === waterHabit.target) return;
    updateHabit({ ...waterHabit, target: goal });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, waterHabit?.id, waterHabit?.target, email]);

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

  const undoableIds = useMemo(
    () => new Set(undoByHabit.keys()),
    [undoByHabit]
  );

  return {
    hydrated,
    cloudLoaded,
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
    clearEntryFor,
    logEntryFor,
    undoToday,
    undoableIds,
    logDetail,
    todayEntry,
    addHabit,
    importData,
    updateHabit,
    removeHabit,
    setArchived,
    reorder,
    pullFromCloud,
  };
}
