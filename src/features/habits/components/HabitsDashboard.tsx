"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { setFocusTaskIntent } from "@/lib/focusIntent";
import { Timer } from "@/components/icons";
import { FocusCorrelationCard } from "@/features/habits/components/FocusCorrelationCard";
import { useFocusSessions } from "@/features/habits/hooks/useFocusSessions";
import {
  clearHabitFocusLink,
  peekHabitFocusLink,
  setHabitFocusLink,
} from "@/features/habits/lib/focusLink";
import { logActivity } from "@/features/focus/data/focusData";
import { todayKey } from "@/features/habits/lib/day";
import { CreateHabitModal } from "@/features/habits/components/CreateHabitModal";
import { HabitCard } from "@/features/habits/components/HabitCard";
import { HabitOnboarding } from "@/features/habits/components/HabitOnboarding";
import { HabitRing } from "@/features/habits/components/HabitRing";
import { InsightsPanel } from "@/features/habits/components/InsightsPanel";
import {
  type LogDetail,
  LogDetailModal,
} from "@/features/habits/components/LogDetailModal";
import { habitEmoji, hueColor, scheduleLabel } from "@/features/habits/lib/format";
import { useHabits } from "@/features/habits/hooks/useHabits";
import { useHabitReminders } from "@/features/habits/hooks/useHabitReminders";
import { useHabitSync } from "@/features/habits/hooks/useHabitSync";
import type { Habit } from "@/features/habits/lib/types";

const SEEN_KEY = "bd:habits-onboarded:v1";

export function HabitsDashboard() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;
  const router = useRouter();
  const { connected, connecting, connect } = useHabitSync(email);

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
    clearHabitFocusLink(); // clear first so this can't loop
    if (habit && !h.statsByHabit.get(habit.id)?.doneToday) h.toggleToday(habit);
  }, [sessions, h.today, h.allHabits, h.statsByHabit, h.toggleToday]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [detailHabit, setDetailHabit] = useState<Habit | null>(null);

  useEffect(() => {
    if (h.today) setSelectedDay((cur) => cur || h.today);
  }, [h.today]);

  // First run: offer templates once, for a brand-new (empty) tracker.
  useEffect(() => {
    if (!h.hydrated) return;
    if (h.allHabits.length > 0) return;
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

  const isSkipped = (id: string) => h.todayEntry(id)?.status === "skipped";
  const pending = h.dueToday.filter(
    (x) => !h.statsByHabit.get(x.id)?.doneToday && !isSkipped(x.id)
  );
  const resolved = h.dueToday.filter(
    (x) => h.statsByHabit.get(x.id)?.doneToday || isSkipped(x.id)
  );
  const dueCount = h.dueToday.length;
  const progress = dueCount === 0 ? 1 : h.doneTodayCount / dueCount;

  const launchFocus = (habit: Habit) => {
    setFocusTaskIntent(habit.name);
    setHabitFocusLink(habit.id); // so completing the block auto-checks the habit
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

  const cardHandlers = {
    onToggle: h.toggleToday,
    onAdjust: h.adjustToday,
    onSkip: h.skipToday,
    onClear: h.clearToday,
    onDetail: (habit: Habit) => setDetailHabit(habit),
  };

  const empty = h.hydrated && h.allHabits.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Heading */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-50">
            Habits
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Small, repeatable wins — the record of who you&apos;re becoming.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/habits/guide"
            className="text-xs text-slate-400 underline-offset-2 transition hover:text-slate-200 hover:underline"
          >
            Guide
          </Link>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            + New habit
          </button>
        </div>
      </div>

      {email && !connected && (
        <button
          type="button"
          onClick={connect}
          disabled={connecting}
          className="self-start rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 transition hover:border-blue-400 hover:text-blue-300 disabled:opacity-50"
        >
          {connecting ? "Connecting…" : "Saved on this device · Connect to sync"}
        </button>
      )}

      {reminders.hasReminders && reminders.permission === "default" && (
        <button
          type="button"
          onClick={reminders.requestPermission}
          className="self-start rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-200 transition hover:border-blue-400"
        >
          🔔 Turn on reminders
        </button>
      )}
      {reminders.hasReminders && reminders.permission === "denied" && (
        <p className="text-xs text-slate-500">
          Reminders are blocked in your browser settings — enable notifications
          for this site to receive them.
        </p>
      )}

      {empty ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-10 text-center">
          <p className="text-4xl">🌱</p>
          <p className="mt-3 text-base font-medium text-slate-200">
            Start with one small habit
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">
            Tiny and doable beats ambitious and abandoned. Pick from a few
            templates or create your own.
          </p>
          <div className="mt-5 flex justify-center gap-2">
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
        </div>
      ) : (
        <>
          {/* Summary */}
          <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-5">
              <HabitRing
                progress={progress}
                size={72}
                stroke={6}
                color={progress >= 1 ? "#34d399" : "#3b82f6"}
              >
                <span className="text-sm font-semibold text-slate-100 tabular-nums">
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

          {/* Today */}
          {dueCount > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-300">
                Today
              </h3>
              <div className="flex flex-col gap-2">
                {pending.map((habit) => (
                  <HabitCard
                    key={habit.id}
                    habit={habit}
                    stats={h.statsByHabit.get(habit.id)!}
                    skipped={false}
                    entry={h.todayEntry(habit.id)}
                    {...cardHandlers}
                  />
                ))}
                {resolved.length > 0 && (
                  <details className="group" open={pending.length === 0}>
                    <summary className="cursor-pointer list-none py-1 text-xs text-slate-500 transition hover:text-slate-300">
                      Done &amp; skipped ({resolved.length})
                    </summary>
                    <div className="mt-2 flex flex-col gap-2 opacity-80">
                      {resolved.map((habit) => (
                        <HabitCard
                          key={habit.id}
                          habit={habit}
                          stats={h.statsByHabit.get(habit.id)!}
                          skipped={isSkipped(habit.id)}
                          entry={h.todayEntry(habit.id)}
                          {...cardHandlers}
                        />
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </section>
          )}

          {/* All habits / manage */}
          <section className="rounded-2xl border border-slate-800/70 bg-slate-900/85 p-6 shadow-sm sm:p-8">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                All habits
              </h3>
              {h.archived.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowArchived((v) => !v)}
                  className="text-xs text-slate-500 transition hover:text-slate-300"
                >
                  {showArchived ? "Hide" : "Show"} archived ({h.archived.length})
                </button>
              )}
            </div>
            <div className="flex flex-col divide-y divide-slate-800/60">
              {h.habits.map((habit) => {
                const st = h.statsByHabit.get(habit.id)!;
                return (
                  <div key={habit.id} className="flex items-center gap-3 py-2.5">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-lg"
                      style={{ background: `${hueColor(habit.hue, "soft")}55` }}
                    >
                      {habitEmoji(habit)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-100">{habit.name}</p>
                      <p className="truncate text-[11px] text-slate-500">
                        {scheduleLabel(habit)} · 🔥 {st.currentStreak} · {st.rate}%
                        {habit.reminder ? ` · 🔔 ${habit.reminder}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => launchFocus(habit)}
                      aria-label={`Focus on ${habit.name}`}
                      className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-800/60 hover:text-blue-300"
                      title="Start a focus session"
                    >
                      <Timer className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => h.setArchived(habit.id, true)}
                      className="rounded-full px-2 py-1 text-[11px] text-slate-500 transition hover:bg-slate-800/60 hover:text-slate-300"
                    >
                      Archive
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(habit)}
                      className="rounded-full px-2 py-1 text-[11px] text-slate-500 transition hover:bg-slate-800/60 hover:text-slate-300"
                    >
                      Edit
                    </button>
                  </div>
                );
              })}
            </div>

            {showArchived &&
              h.archived.map((habit) => (
                <div key={habit.id} className="flex items-center gap-3 border-t border-slate-800/60 py-2.5 opacity-70">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-lg">
                    {habitEmoji(habit)}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm text-slate-300">{habit.name}</p>
                  <button
                    type="button"
                    onClick={() => h.setArchived(habit.id, false)}
                    className="rounded-full px-2 py-1 text-[11px] text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => h.removeHabit(habit.id)}
                    className="rounded-full px-2 py-1 text-[11px] text-red-400/80 transition hover:bg-red-950/40 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              ))}
          </section>

          {/* Full analysis dashboard */}
          <InsightsPanel
            habits={h.habits}
            statsByHabit={h.statsByHabit}
            entries={h.entries}
            dayCounts={h.dayCounts}
            today={h.today}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />

          {/* The moat: how habits line up with focus output */}
          <FocusCorrelationCard
            habits={h.allHabits}
            entries={h.entries}
            sessions={sessions}
            today={h.today}
          />
        </>
      )}

      <CreateHabitModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSave={(habit) => (editing ? h.updateHabit(habit) : h.addHabit(habit))}
        onDelete={(id) => h.removeHabit(id)}
        initial={editing}
        nextSortOrder={nextSortOrder}
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
        nextSortOrder={nextSortOrder}
      />
      <LogDetailModal
        open={Boolean(detailHabit)}
        onClose={() => setDetailHabit(null)}
        habit={detailHabit}
        entry={detailHabit ? h.todayEntry(detailHabit.id) : null}
        onSave={(habit, detail: LogDetail) => h.logDetail(habit, detail)}
      />
    </div>
  );
}

export default HabitsDashboard;
