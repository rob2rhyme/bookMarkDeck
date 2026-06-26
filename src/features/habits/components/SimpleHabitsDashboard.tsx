"use client";

// Beginner-first /habits view. Answers "what do I do today?" at a glance:
// Summary → Today (the hero) → a compact habit list → analytics deferred until
// there's data to show. Reuses the SAME useHabits data layer + modals as the
// Classic dashboard (HabitsDashboard.tsx); this redesign doesn't change Classic,
// and a persisted toggle flips between the two.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { setFocusTaskIntent } from "@/lib/focusIntent";
import { HabitsViewToggle } from "@/features/habits/components/HabitsViewToggle";
import { ChevronUp, DotsVertical, Emoji } from "@/components/icons";
import { logActivity } from "@/features/focus/data/focusData";
import { todayKey } from "@/features/habits/lib/day";
import {
  clearHabitFocusLink,
  peekHabitFocusLink,
  setHabitFocusLink,
} from "@/features/habits/lib/focusLink";
import { CreateHabitModal } from "@/features/habits/components/CreateHabitModal";
import { FocusCorrelationCard } from "@/features/habits/components/FocusCorrelationCard";
import { HabitOnboarding } from "@/features/habits/components/HabitOnboarding";
import { HabitRing } from "@/features/habits/components/HabitRing";
import { InsightsPanel } from "@/features/habits/components/InsightsPanel";
import {
  type LogDetail,
  LogDetailModal,
} from "@/features/habits/components/LogDetailModal";
import { SimpleHabitCard } from "@/features/habits/components/SimpleHabitCard";
import { SyncStatusChip } from "@/features/habits/components/SyncStatusChip";
import {
  areaIconByName,
  DEFAULT_AREA_ICON,
  deriveAreas,
} from "@/features/habits/lib/areas";
import { habitEmoji, hueColor, scheduleLabel } from "@/features/habits/lib/format";
import { useFocusSessions } from "@/features/habits/hooks/useFocusSessions";
import { useHabits } from "@/features/habits/hooks/useHabits";
import { useHabitReminders } from "@/features/habits/hooks/useHabitReminders";
import { useHabitSync } from "@/features/habits/hooks/useHabitSync";
import type { Habit, HabitStats } from "@/features/habits/lib/types";

const SEEN_KEY = "bd:habits-onboarded:v1";
const SORT_KEY = "bd:habits-sort:v1";

type SortMode = "used" | "streak" | "name" | "manual";

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "used", label: "Most used" },
  { key: "streak", label: "Streak" },
  { key: "name", label: "A–Z" },
  { key: "manual", label: "My order" },
];

function normalizeSort(v: unknown): SortMode {
  return v === "streak" || v === "name" || v === "manual" ? v : "used";
}

/** Reorder by usage / streak / name, or keep the manual sortOrder. Stable ties. */
function sortHabits(
  list: Habit[],
  mode: SortMode,
  statsByHabit: Map<string, HabitStats>
): Habit[] {
  if (mode === "manual") return list;
  const st = (h: Habit) => statsByHabit.get(h.id);
  const arr = [...list];
  if (mode === "name") {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  } else if (mode === "streak") {
    arr.sort(
      (a, b) =>
        (st(b)?.currentStreak ?? 0) - (st(a)?.currentStreak ?? 0) ||
        (st(b)?.totalDone ?? 0) - (st(a)?.totalDone ?? 0)
    );
  } else {
    // "used": most-completed all-time first, then higher 30-day rate.
    arr.sort(
      (a, b) =>
        (st(b)?.totalDone ?? 0) - (st(a)?.totalDone ?? 0) ||
        (st(b)?.rate ?? 0) - (st(a)?.rate ?? 0)
    );
  }
  return arr;
}

function SortMenu({
  value,
  onChange,
}: {
  value: SortMode;
  onChange: (m: SortMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const current = SORT_OPTIONS.find((o) => o.key === value) ?? SORT_OPTIONS[0];
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-slate-600"
      >
        Sort: {current.label} ▾
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-36 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 py-1 shadow-xl">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              aria-pressed={o.key === value}
              onClick={() => {
                onChange(o.key);
                setOpen(false);
              }}
              className={`block w-full px-3 py-1.5 text-left text-sm transition hover:bg-slate-800 ${
                o.key === value ? "text-blue-300" : "text-slate-200"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Compact row in the "Your habits" manager, with a single overflow menu. */
function ManageRow({
  habit,
  streak,
  strength,
  onEdit,
  onFocus,
  onArchive,
  onDelete,
}: {
  habit: Habit;
  streak: number;
  strength: number;
  onEdit: (h: Habit) => void;
  onFocus: (h: Habit) => void;
  onArchive: (h: Habit) => void;
  onDelete: (h: Habit) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg"
        style={{ background: `${hueColor(habit.hue, "soft")}55` }}
      >
        <Emoji>{habitEmoji(habit)}</Emoji>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-100">
          {habit.name}
          {habit.direction === "quit" && (
            <span className="ml-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
              Quit
            </span>
          )}
          {habit.area?.trim() && (
            <span className="ml-2 rounded-full border border-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
              {(habit.areaIcon?.trim() || DEFAULT_AREA_ICON) +
                " " +
                habit.area.trim()}
            </span>
          )}
        </p>
        <p className="truncate text-[11px] text-slate-500">
          {scheduleLabel(habit)}
          {streak > 0 ? ` · 🔥 ${streak}` : ""}
          {` · 💪 ${strength}%`}
        </p>
      </div>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={`Options for ${habit.name}`}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-800/60 hover:text-slate-300"
        >
          <DotsVertical className="h-4 w-4" />
        </button>
        {open && (
          <div className="absolute right-0 z-30 mt-1 w-40 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 py-1 shadow-xl">
            <button
              type="button"
              onClick={() => run(() => onEdit(habit))}
              className="block w-full px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => run(() => onFocus(habit))}
              className="block w-full px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"
            >
              Start focus
            </button>
            <button
              type="button"
              onClick={() => run(() => onArchive(habit))}
              className="block w-full px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"
            >
              Archive
            </button>
            <button
              type="button"
              onClick={() => run(() => onDelete(habit))}
              className="block w-full border-t border-slate-800/60 px-3 py-2 text-left text-sm text-red-400/90 transition hover:bg-red-950/40 hover:text-red-300"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function SimpleHabitsDashboard() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;
  const router = useRouter();
  const { connected, connecting, error, connect } = useHabitSync(email);

  const onLog = useMemo(
    () =>
      (type: "habit_done" | "habit_skipped", summary: string) => {
        if (connected && email) {
          logActivity(email, type, summary, todayKey()).catch(() => {});
        }
      },
    [connected, email]
  );

  const h = useHabits(email, connected, onLog);
  const reminders = useHabitReminders(email, h.habits, h.statsByHabit, h.today);
  const sessions = useFocusSessions(email, connected);

  // Sync is reflected automatically: useHabitSync's onAuthStateChanged silently
  // adopts an existing Firebase session (from bookmarks/focus). We deliberately
  // DON'T auto-call connect() — that can open a Google popup without a user
  // gesture (often blocked). The chip's "Saved on this device · Sync" button
  // triggers the interactive connect from a real tap instead.

  // Auto-check a habit when a focus session it launched completes today.
  useEffect(() => {
    if (!h.today || sessions.length === 0) return;
    const link = peekHabitFocusLink();
    if (!link || link.day !== h.today) return;
    const completed = sessions.some(
      (s) => s.day === h.today && (s.createdAt ?? "") >= link.at
    );
    if (!completed) return;
    const habit = h.allHabits.find((x) => x.id === link.habitId);
    clearHabitFocusLink();
    if (habit && !h.statsByHabit.get(habit.id)?.doneToday) h.toggleToday(habit);
  }, [sessions, h.today, h.allHabits, h.statsByHabit, h.toggleToday]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState("");
  const [detailHabit, setDetailHabit] = useState<Habit | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [areaFilter, setAreaFilter] = useState(""); // "" = all, "__none__" = no area

  useEffect(() => {
    if (h.today) setSelectedDay((cur) => cur || h.today);
  }, [h.today]);

  // First run: offer templates once for a brand-new (empty) tracker.
  useEffect(() => {
    if (!h.hydrated || h.allHabits.length > 0) return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(SEEN_KEY) === "1";
    } catch {}
    if (!seen) setOnboardOpen(true);
  }, [h.hydrated, h.allHabits.length]);

  const markSeen = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {}
  };

  const nextSortOrder =
    h.allHabits.reduce((m, x) => Math.max(m, x.sortOrder), -1) + 1;

  const [sortMode, setSortMode] = useState<SortMode>("used");
  useEffect(() => {
    try {
      const s = window.localStorage.getItem(SORT_KEY);
      if (s) setSortMode(normalizeSort(s));
    } catch {}
  }, []);
  const changeSort = (m: SortMode) => {
    setSortMode(m);
    try {
      window.localStorage.setItem(SORT_KEY, m);
    } catch {}
  };

  const isSkipped = (id: string) => h.todayEntry(id)?.status === "skipped";
  const pending = sortHabits(
    h.dueToday.filter(
      (x) => !h.statsByHabit.get(x.id)?.doneToday && !isSkipped(x.id)
    ),
    sortMode,
    h.statsByHabit
  );
  const resolved = sortHabits(
    h.dueToday.filter(
      (x) => h.statsByHabit.get(x.id)?.doneToday || isSkipped(x.id)
    ),
    sortMode,
    h.statsByHabit
  );
  const sortedManage = sortHabits(h.habits, sortMode, h.statsByHabit);
  // Areas (categories) — same model as the classic view.
  const areas = useMemo(() => deriveAreas(h.allHabits), [h.allHabits]);
  const areaIcons = useMemo(() => areaIconByName(h.allHabits), [h.allHabits]);
  const hasAreas = areas.length > 0;
  const someUncategorized = h.habits.some((x) => !x.area?.trim());
  const manageHabits = sortedManage.filter((x) => {
    if (!areaFilter) return true;
    if (areaFilter === "__none__") return !x.area?.trim();
    return x.area?.trim() === areaFilter;
  });
  const dueCount = h.dueToday.length;
  const progress = dueCount === 0 ? 1 : h.doneTodayCount / dueCount;

  const launchFocus = (habit: Habit) => {
    setFocusTaskIntent(habit.name);
    setHabitFocusLink(habit.id);
    router.push("/focus");
  };
  const openCreate = () => {
    setEditing(null);
    setCreateOpen(true);
  };
  const openEdit = (habit: Habit) => {
    setEditing(habit);
    setCreateOpen(true);
  };
  const removeHabitConfirmed = (habit: Habit) => {
    const ok =
      typeof window === "undefined" ||
      window.confirm(
        `Delete “${habit.name}”? This removes the habit for good. Its history is left untouched.`
      );
    if (ok) h.removeHabit(habit.id);
  };

  const cardHandlers = {
    onToggle: h.toggleToday,
    onAdjust: h.adjustToday,
    onSkip: h.skipToday,
    onClear: h.clearToday,
    onUndo: h.undoToday,
    onDetail: (habit: Habit) => setDetailHabit(habit),
    onFocus: launchFocus,
  };

  const empty = h.hydrated && h.allHabits.length === 0;
  // Defer analytics until there's enough to be meaningful (no wall of zeros).
  const showAnalytics = h.dayCounts.size >= 7 || h.allHabits.length >= 3;

  return (
    <div className="flex flex-col gap-6">
      {/* Heading */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-50">
            Habits
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Small, repeatable wins — one tap a day.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <HabitsViewToggle />
          <button
            type="button"
            onClick={openCreate}
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            + New habit
          </button>
        </div>
      </div>

      {/* Status row: honest sync chip + optional reminders nudge. */}
      <div className="flex flex-wrap items-center gap-2">
        <SyncStatusChip
          signedIn={Boolean(email)}
          connected={connected}
          connecting={connecting}
          error={error}
          onConnect={connect}
        />
        {reminders.hasReminders && reminders.permission === "default" && (
          <button
            type="button"
            onClick={reminders.requestPermission}
            className="rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-200 transition hover:border-blue-400"
          >
            🔔 Turn on reminders
          </button>
        )}
        {reminders.hasReminders && reminders.permission === "denied" && (
          <span className="text-xs text-slate-500">
            Reminders are blocked in your browser settings.
          </span>
        )}
        <Link
          href="/habits/guide"
          className="ml-auto text-xs text-slate-500 underline-offset-2 transition hover:text-slate-300 hover:underline"
        >
          How habits work
        </Link>
      </div>

      {empty ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-10 text-center">
          <p className="text-4xl">🌱</p>
          <p className="mt-3 text-base font-medium text-slate-200">
            Start with one small habit
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">
            Tiny and doable beats ambitious and abandoned. Pick a template or
            create your own — you can change it anytime.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => setOnboardOpen(true)}
              className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500"
            >
              Browse templates
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              + New habit
            </button>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            New to this?{" "}
            <Link
              href="/habits/guide"
              className="text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
            >
              How habits work
            </Link>
          </p>
        </div>
      ) : (
        <>
          {/* Summary ring */}
          <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-4 shadow-sm sm:p-8">
            <div className="flex items-center gap-5">
              <HabitRing
                progress={progress}
                size={72}
                stroke={6}
                color={progress >= 1 ? "#34d399" : "#3b82f6"}
              >
                <span className="text-sm font-semibold tabular-nums text-slate-100">
                  {h.doneTodayCount}/{dueCount}
                </span>
              </HabitRing>
              <div>
                <p className="text-lg font-semibold text-slate-50">
                  {dueCount === 0
                    ? "Nothing scheduled today"
                    : progress >= 1
                      ? "All done today 🎉"
                      : `${dueCount - h.doneTodayCount} habit${
                          dueCount - h.doneTodayCount === 1 ? "" : "s"
                        } left today`}
                </p>
                <p className="mt-0.5 text-sm text-slate-400">
                  {progress >= 1 && dueCount > 0
                    ? "Beautiful consistency. See you tomorrow."
                    : "One at a time — just show up."}
                </p>
              </div>
            </div>
          </section>

          {/* Today — the hero */}
          <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-4 shadow-sm sm:p-8">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                Today
              </h3>
              {dueCount > 1 && (
                <SortMenu value={sortMode} onChange={changeSort} />
              )}
            </div>
            {dueCount === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-800 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-400">
                Nothing scheduled today. Add a habit or enjoy the breather.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {pending.map((habit) => (
                  <SimpleHabitCard
                    key={habit.id}
                    habit={habit}
                    stats={h.statsByHabit.get(habit.id)!}
                    skipped={false}
                    canUndo={h.undoableIds.has(habit.id)}
                    {...cardHandlers}
                  />
                ))}
                {resolved.length > 0 && (
                  <details className="group mt-1" open={pending.length === 0}>
                    <summary className="cursor-pointer list-none py-1 text-xs text-slate-500 transition hover:text-slate-300">
                      Done &amp; skipped ({resolved.length})
                    </summary>
                    <div className="mt-2 flex flex-col gap-2 opacity-80">
                      {resolved.map((habit) => (
                        <SimpleHabitCard
                          key={habit.id}
                          habit={habit}
                          stats={h.statsByHabit.get(habit.id)!}
                          skipped={isSkipped(habit.id)}
                          canUndo={h.undoableIds.has(habit.id)}
                          {...cardHandlers}
                        />
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </section>

          {/* Your habits — compact manager */}
          {h.habits.length > 0 && (
            <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-4 shadow-sm sm:p-8">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                  Your habits
                </h3>
                {h.archived.length > 0 && (
                  <span className="text-[11px] text-slate-500">
                    {h.archived.length} archived (manage in Classic)
                  </span>
                )}
              </div>
              {!hasAreas && h.habits.length > 0 && (
                <p className="mb-3 text-[11px] text-slate-500">
                  Tip: give a habit an{" "}
                  <span className="text-slate-300">Area</span> to group and
                  filter them — open a habit&apos;s ⋯ menu → Edit.
                </p>
              )}
              {hasAreas && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {([["", "All"]] as [string, string][])
                    .concat(areas.map((a) => [a.name, `${a.icon} ${a.name}`]))
                    .concat(someUncategorized ? [["__none__", "No area"]] : [])
                    .map(([value, label]) => (
                      <button
                        key={value || "all"}
                        type="button"
                        aria-pressed={areaFilter === value}
                        onClick={() => setAreaFilter(value)}
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                          areaFilter === value
                            ? "border-blue-400/70 bg-blue-500/10 text-blue-200"
                            : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                </div>
              )}
              <div className="flex flex-col divide-y divide-slate-800/60">
                {manageHabits.map((habit) => (
                  <ManageRow
                    key={habit.id}
                    habit={habit}
                    streak={h.statsByHabit.get(habit.id)?.currentStreak ?? 0}
                    strength={h.statsByHabit.get(habit.id)?.strength ?? 0}
                    onEdit={openEdit}
                    onFocus={launchFocus}
                    onArchive={(x) => h.setArchived(x.id, true)}
                    onDelete={removeHabitConfirmed}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Insights — deferred until there's data, then collapsed by default.
              On mobile the wrapper drops its own horizontal padding so the inner
              panels (already full-width cards) bleed wider; desktop keeps the
              padded card (sm:p-8) unchanged. */}
          {showAnalytics ? (
            <section className="rounded-2xl border border-transparent bg-transparent p-0 shadow-none sm:border-slate-800/70 sm:bg-slate-900/85 sm:p-8 sm:shadow-sm">
              <button
                type="button"
                onClick={() => setInsightsOpen((o) => !o)}
                aria-expanded={insightsOpen}
                className="flex w-full items-center justify-between gap-2 px-1 text-left sm:px-0"
              >
                <span className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                  Insights &amp; history
                </span>
                <ChevronUp
                  className={`h-4 w-4 text-slate-500 transition ${
                    insightsOpen ? "" : "rotate-180"
                  }`}
                />
              </button>
              {insightsOpen && (
                <div className="mt-5 flex flex-col gap-6">
                  <InsightsPanel
                    habits={h.habits}
                    statsByHabit={h.statsByHabit}
                    entries={h.entries}
                    dayCounts={h.dayCounts}
                    today={h.today}
                    selectedDay={selectedDay}
                    onSelectDay={setSelectedDay}
                    onRemoveEntry={(habit, entry) =>
                      h.clearEntryFor(habit, entry.day)
                    }
                    onLogEntry={(habit, day, detail) =>
                      h.logEntryFor(habit, day, detail)
                    }
                  />
                  <FocusCorrelationCard
                    habits={h.allHabits}
                    entries={h.entries}
                    sessions={sessions}
                    today={h.today}
                  />
                </div>
              )}
            </section>
          ) : (
            <p className="flex items-center gap-2 rounded-xl border border-slate-800/70 bg-slate-900/50 px-4 py-3 text-[13px] text-slate-400">
              <span aria-hidden="true">📊</span> Charts and streak history appear
              once you&apos;ve logged a few days.
            </p>
          )}
        </>
      )}

      <CreateHabitModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSave={(habit) => (editing ? h.updateHabit(habit) : h.addHabit(habit))}
        onDelete={(id) => h.removeHabit(id)}
        initial={editing}
        nextSortOrder={nextSortOrder}
        existingAreas={areas.map((a) => a.name)}
        areaIcons={areaIcons}
      />
      <HabitOnboarding
        open={onboardOpen}
        onClose={() => {
          markSeen();
          setOnboardOpen(false);
        }}
        onAddMany={(habits) => {
          markSeen();
          habits.forEach((habit) => h.addHabit(habit));
        }}
        onCustom={() => {
          markSeen();
          setOnboardOpen(false);
          openCreate();
        }}
        nextSortOrder={nextSortOrder}
      />
      <LogDetailModal
        open={Boolean(detailHabit)}
        onClose={() => setDetailHabit(null)}
        habit={detailHabit}
        entry={detailHabit ? h.todayEntry(detailHabit.id) : null}
        today={h.today}
        onSave={(habit, detail: LogDetail, day) =>
          day === h.today
            ? h.logDetail(habit, detail)
            : h.logEntryFor(habit, day, detail)
        }
      />
    </div>
  );
}

export default SimpleHabitsDashboard;
