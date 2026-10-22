"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  deleteEntry,
  deleteHabit,
  fetchEntries,
  fetchHabits,
  saveEntry,
  saveEntryCount,
  saveHabit,
  subscribeEntries,
  subscribeHabits,
} from "@/features/habits/data/habitData";
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
import { getFocusWaterGoal } from "@/features/habits/lib/water";
import {
  mergeStep,
  resolveSource,
  type TrackableSource,
} from "@/features/habits/lib/trackableSources";
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

/** An entry's done-count: what a linked source counts for it. */
const doneCount = (e: HabitEntry | null | undefined) => (e && e.status === "done" ? e.count : 0);

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
  // Every write goes through commitEntries, which moves the ref with the state:
  // snapshots arrive several to a render (an outbox flush lands one per
  // change), even between a render and its effects, and a merge reading a stale
  // count took a real change for "no change". An effect copying the rendered
  // entries into the ref put an older count back over a newer one.
  const entriesRef = useRef(entries);
  const commitEntries = useCallback(
    (next: HabitEntry[] | ((prev: HabitEntry[]) => HabitEntry[])) => {
      entriesRef.current = typeof next === "function" ? next(entriesRef.current) : next;
      setEntries(entriesRef.current);
    },
    []
  );

  // Per-habit single-step undo: the today-entry that existed just before the
  // most recent tap (null = there was none), the done-count the tap left, and
  // the source the tap was linked to. Set on every logging action, consumed by
  // undoToday, and reset when the day rolls over.
  const [undoByHabit, setUndoByHabit] = useState<
    Map<string, { before: HabitEntry | null; after: number; source: string | null }>
  >(() => new Map());

  // Hydration-safe load (after mount only).
  useEffect(() => {
    setHabits(loadHabits(email));
    commitEntries(loadEntries(email));
    setToday(todayKey());
    setHydrated(true);
  }, [email, commitEntries]);

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
      // A count adopted while not connected: its own queue, replayed through
      // saveEntryCount only — see adoptCount.
      const ecUps = pendingUpsertIds("habitEntryCounts", email);
      if (ecUps.size)
        await Promise.all(
          entries
            .filter((e) => ecUps.has(e.id))
            .map((e) => saveEntryCount(email, e).catch(() => {}))
        );
      clearPendingUpserts("habits", email);
      clearPendingUpserts("habitEntries", email);
      clearPendingUpserts("habitEntryCounts", email);
    })()
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        unsubH = subscribeHabits(email, (h) => {
          setHabits(h);
          setCloudLoaded(true);
        });
        unsubE = subscribeEntries(email, commitEntries);
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
    commitEntries(e);
  }, [canSync, email, commitEntries]);

  /* ---------------------------------------------------------- entries --- */

  const upsertEntry = useCallback(
    (entry: HabitEntry) => {
      commitEntries((prev) => [...prev.filter((e) => e.id !== entry.id), entry]);
      if (canSync && email) saveEntry(email, entry).catch(() => {});
      else queueUpsert("habitEntries", email, entry.id);
    },
    [canSync, email, commitEntries]
  );

  // A count taken from a linked source writes only the count: this copy of the
  // entry may not have the note and time another device logged on it yet.
  // Nothing is queued while not connected — a queued entry goes up whole on
  // connect — since once connected the habit takes the source's count again.
  const adoptCount = useCallback(
    (entry: HabitEntry) => {
      commitEntries((prev) => [...prev.filter((e) => e.id !== entry.id), entry]);
      if (canSync && email) saveEntryCount(email, entry).catch(() => {});
      // Queued separately from a manual edit's upsert: the connect effect
      // replays THIS queue through saveEntryCount too, never saveEntry, or
      // it would write back the note and time this device cached and undo
      // the fix above. Without queueing at all, a day that rolls over before
      // connecting is never revisited (the reverse-sync effect re-adopts
      // only "today"), and the next cloud snapshot replaces local state
      // wholesale — so the adoption was simply lost.
      else queueUpsert("habitEntryCounts", email, entry.id);
    },
    [canSync, email, commitEntries]
  );

  const removeEntry = useCallback(
    (id: string) => {
      commitEntries((prev) => prev.filter((e) => e.id !== id));
      if (canSync && email) deleteEntry(email, id).catch(() => {});
      else {
        queueDelete("habitEntries", email, id);
        unqueueUpsert("habitEntries", email, id);
      }
    },
    [canSync, email, commitEntries]
  );

  const entryId = (habitId: string, day: string) => `${habitId}_${day}`;
  const todayEntry = useCallback(
    (habitId: string) =>
      entries.find((e) => e.id === entryId(habitId, today)) ?? null,
    [entries, today]
  );
  // The same, as of the latest write rather than the last render — what an
  // action changes from.
  const currentEntry = useCallback(
    (habitId: string) =>
      entriesRef.current.find((e) => e.id === entryId(habitId, today)) ?? null,
    [today]
  );

  // Forget pending undos when the day changes (yesterday's snapshot is moot).
  useEffect(() => {
    setUndoByHabit(new Map());
  }, [today]);

  // Snapshot today's entry (or null) right before a tap mutates it, with the
  // done-count the tap leaves, so the tap can be reverted.
  const recordUndo = useCallback(
    (habit: Habit, after: number) => {
      const before = currentEntry(habit.id);
      const source = resolveSource(habit)?.id ?? null;
      setUndoByHabit((m) => {
        const next = new Map(m);
        next.set(habit.id, { before, after, source });
        return next;
      });
    },
    [currentEntry]
  );

  // Forward-mirror a tap on a linked habit — today's count going from
  // `previous` to `value` — to its Focus source (e.g. a water habit → Focus
  // hydration, as the change it makes). No-op for habits whose source has no
  // writable surface (journal/meditation/focus) or that aren't linked at all.
  const mirrorLinked = useCallback(
    (habit: Habit, value: number, previous: number) => {
      if (!today) return;
      const source = resolveSource(habit);
      if (!source?.mirror) return;
      const clean = (n: number) => Math.max(0, Math.round(n));
      source.mirror({ email, day: today, canSync }, clean(value), clean(previous));
    },
    [canSync, email, today]
  );

  /** Binary: toggle done/clear. Measurable: jump to target / clear. */
  const toggleToday = useCallback(
    (habit: Habit) => {
      if (!today) return;
      const existing = currentEntry(habit.id);
      const target = habitTarget(habit);
      const isDone = existing?.status === "done" && existing.count >= target;
      recordUndo(habit, isDone ? 0 : target);
      if (isDone) {
        removeEntry(entryId(habit.id, today));
        mirrorLinked(habit, 0, doneCount(existing));
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
      mirrorLinked(habit, target, doneCount(existing));
      onLog?.("habit_done", `Completed habit: ${habit.name}`);
    },
    [today, currentEntry, upsertEntry, removeEntry, onLog, recordUndo, mirrorLinked]
  );

  /** Measurable +/- by a delta. Clears the entry at 0; logs when target met. */
  const adjustToday = useCallback(
    (habit: Habit, delta: number) => {
      if (!today) return;
      const existing = currentEntry(habit.id);
      const target = habitTarget(habit);
      const prevCount =
        existing && existing.status === "done" ? existing.count : 0;
      const wasDone = prevCount >= target;
      const count = Math.max(0, prevCount + delta);
      recordUndo(habit, count);
      if (count === 0) {
        removeEntry(entryId(habit.id, today));
        mirrorLinked(habit, 0, prevCount);
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
      mirrorLinked(habit, count, prevCount);
      if (!wasDone && count >= target)
        onLog?.("habit_done", `Completed habit: ${habit.name}`);
    },
    [today, currentEntry, upsertEntry, removeEntry, onLog, recordUndo, mirrorLinked]
  );

  const skipToday = useCallback(
    (habit: Habit) => {
      if (!today) return;
      const previous = doneCount(currentEntry(habit.id));
      recordUndo(habit, 0);
      upsertEntry({
        id: entryId(habit.id, today),
        habitId: habit.id,
        day: today,
        status: "skipped",
        count: 0,
        createdAt: new Date().toISOString(),
      });
      mirrorLinked(habit, 0, previous);
      onLog?.("habit_skipped", `Skipped habit: ${habit.name}`);
    },
    [today, currentEntry, upsertEntry, onLog, recordUndo, mirrorLinked]
  );

  const clearToday = useCallback(
    (habit: Habit) => {
      if (!today) return;
      const previous = doneCount(currentEntry(habit.id));
      removeEntry(entryId(habit.id, today));
      mirrorLinked(habit, 0, previous);
    },
    [today, currentEntry, removeEntry, mirrorLinked]
  );

  /** Remove a habit's entry for any day (e.g. an accidental log in history). */
  const clearEntryFor = useCallback(
    (habit: Habit, day: string) => {
      if (!day) return;
      const previous = doneCount(currentEntry(habit.id));
      removeEntry(entryId(habit.id, day));
      if (day === today) mirrorLinked(habit, 0, previous);
    },
    [today, currentEntry, removeEntry, mirrorLinked]
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
      const prev = entriesRef.current.find((e) => e.id === id) ?? null;
      if (detail.status === "clear") {
        removeEntry(id);
        if (day === today) mirrorLinked(habit, 0, doneCount(prev));
        return;
      }
      const target = habitTarget(habit);
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
      if (day === today)
        mirrorLinked(habit, detail.status === "done" ? count : 0, doneCount(prev));
    },
    [today, upsertEntry, removeEntry, mirrorLinked]
  );

  /**
   * Revert the most recent tap on a habit to the snapshot taken before it. A
   * habit linked both ways (water) takes back only the tap's change to the
   * count instead: it may have taken in cups from other devices since, and
   * restoring the count from before the tap erased them. The rest of the entry
   * is the snapshot's. A tap made under a link the habit no longer has (or
   * without the one it now has) isn't undone: as a change to Focus it would
   * take back cups the tap never sent, or leave behind ones it did.
   */
  const undoToday = useCallback(
    (habit: Habit) => {
      if (!today) return;
      const rec = undoByHabit.get(habit.id);
      if (rec === undefined) return; // nothing recorded
      const forget = () =>
        setUndoByHabit((m) => {
          const next = new Map(m);
          next.delete(habit.id);
          return next;
        });
      const source = resolveSource(habit);
      if ((source?.id ?? null) !== rec.source) return forget();
      const current = currentEntry(habit.id);
      let restored = rec.before;
      if (source?.policy === "bidirectional") {
        const count = doneCount(current) - (rec.after - doneCount(rec.before));
        const base = rec.before ?? current;
        if (count > 0 && base) restored = { ...base, status: "done", count };
        else if (count <= 0 && rec.before?.status === "done") restored = null;
      }
      if (restored === null) removeEntry(entryId(habit.id, today));
      else upsertEntry(restored);
      mirrorLinked(habit, doneCount(restored), doneCount(current));
      forget();
    },
    [today, currentEntry, undoByHabit, removeEntry, upsertEntry, mirrorLinked]
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
      const prev = currentEntry(habit.id);
      if (detail.status === "clear") {
        recordUndo(habit, 0);
        removeEntry(entryId(habit.id, today));
        mirrorLinked(habit, 0, doneCount(prev));
        return;
      }
      const target = habitTarget(habit);
      const wasDone = prev?.status === "done" && prev.count >= target;
      const count =
        detail.status === "skipped"
          ? 0
          : Math.max(1, Math.round(detail.count ?? prev?.count ?? target));
      recordUndo(habit, detail.status === "done" ? count : 0);
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
      mirrorLinked(habit, detail.status === "done" ? count : 0, doneCount(prev));
      if (detail.status === "done" && !wasDone)
        onLog?.("habit_done", `Completed habit: ${habit.name}`);
      if (detail.status === "skipped" && prev?.status !== "skipped")
        onLog?.("habit_skipped", `Skipped habit: ${habit.name}`);
    },
    [today, currentEntry, upsertEntry, removeEntry, onLog, recordUndo, mirrorLinked]
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
        commitEntries((prev) => {
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
    [habits, entries, canSync, email, commitEntries]
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

  // Habits bound to a Focus trackable source — explicitly via linkedSourceId or
  // by a source's heuristic match. One generic engine subscribes + merges them
  // (replacing the former bespoke water/journal bridges). Held in a ref so each
  // subscription reads the latest binding without re-subscribing.
  const linked = useMemo(
    () =>
      active
        .map((habit) => ({ habit, source: resolveSource(habit) }))
        .filter(
          (x): x is { habit: Habit; source: TrackableSource } =>
            x.source !== null
        ),
    [active]
  );
  const linkedRef = useRef(linked);
  useEffect(() => {
    linkedRef.current = linked;
  }, [linked]);
  // Re-subscribe only when the set of (habit → source) bindings changes.
  const linkKey = linked
    .map((x) => `${x.habit.id}:${x.source.id}`)
    .sort()
    .join(",");

  // Reverse sync: reflect each linked Focus source into its habit's today entry
  // per the source's merge policy (mergeStep). Writing the entry here never
  // triggers a forward mirror — nothing is pushed back — so there's no loop.
  useEffect(() => {
    if (!canSync || !email || !today) return;
    const day = today;
    const unsubs = linked.map(({ habit, source }) => {
      return source.subscribe(email, day, (remote) => {
        const cur = linkedRef.current.find(
          (x) => x.habit.id === habit.id && x.source.id === source.id
        );
        if (!cur) return;
        const id = `${habit.id}_${day}`;
        const e = entriesRef.current.find((x) => x.id === id);
        const curCount = e && e.status === "done" ? e.count : 0;
        const r = mergeStep({
          policy: source.policy,
          habitType: cur.habit.type,
          curCount,
          remote,
          target: habitTarget(cur.habit),
        });
        if (r.remove) removeEntry(id);
        else if (r.set != null)
          adoptCount({
            ...e, // a note or time logged on the entry stays
            id,
            habitId: habit.id,
            day,
            status: "done",
            count: r.set,
            createdAt: e?.createdAt ?? new Date().toISOString(),
          });
      });
    });
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSync, email, today, linkKey]);

  // Offline/no-sync path: raise each linked habit's today entry from its source's
  // local cache (always raise-only, so a higher habit value is never wiped).
  useEffect(() => {
    if (!hydrated || !today) return;
    for (const { habit, source } of linked) {
      const cached = source.readCache(email, today);
      if (cached == null) continue;
      const id = entryId(habit.id, today);
      const e = entriesRef.current.find((x) => x.id === id);
      const curCount = e && e.status === "done" ? e.count : 0;
      const r = mergeStep({
        policy: "raiseOnly",
        habitType: habit.type,
        curCount,
        remote: cached,
        target: habitTarget(habit),
      });
      if (r.set != null)
        adoptCount({
          ...e,
          id,
          habitId: habit.id,
          day: today,
          status: "done",
          count: r.set,
          createdAt: e?.createdAt ?? new Date().toISOString(),
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, linkKey, today]);

  // Keep a water-linked habit's daily target in lock-step with the Focus
  // hydration goal (its single source of truth), so both pages show "/N cups".
  const waterHabit = useMemo(
    () => active.find((h) => resolveSource(h)?.id === "hydration") ?? null,
    [active]
  );
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

  // Not a tap made under a link the habit no longer has: undoToday ignores it.
  const undoableIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, rec] of undoByHabit) {
      const habit = habits.find((h) => h.id === id);
      if (habit && (resolveSource(habit)?.id ?? null) === rec.source) ids.add(id);
    }
    return ids;
  }, [undoByHabit, habits]);

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
