"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { setFocusTaskIntent } from "@/lib/focusIntent";
import { Archive, Emoji, Pencil, Timer, Trash } from "@/components/icons";
import { SectionNav, type SectionNavItem } from "@/components/SectionNav";
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
import { HabitsViewToggle } from "@/features/habits/components/HabitsViewToggle";
import { HabitCard } from "@/features/habits/components/HabitCard";
import { HabitNotesModal } from "@/features/habits/components/HabitNotesModal";
import { HabitOnboarding } from "@/features/habits/components/HabitOnboarding";
import { HabitRing } from "@/features/habits/components/HabitRing";
import { InsightsPanel } from "@/features/habits/components/InsightsPanel";
import { RowMenu } from "@/features/habits/components/RowMenu";
import {
  type LogDetail,
  LogDetailModal,
} from "@/features/habits/components/LogDetailModal";
import { habitEmoji, hueColor, scheduleLabel } from "@/features/habits/lib/format";
import {
  areaIconByName,
  DEFAULT_AREA_ICON,
  deriveAreas,
} from "@/features/habits/lib/areas";
import {
  entriesToCsv,
  habitsFromJson,
  habitsToJson,
} from "@/features/habits/lib/exportHabits";
import { Modal } from "@/components/Modal";
import { downloadText } from "@/utils/download";
import { fetchUiFlag, markUiFlag } from "@/lib/uiPrefs";
import { useHabits } from "@/features/habits/hooks/useHabits";
import { useHabitReminders } from "@/features/habits/hooks/useHabitReminders";
import { useHabitSync } from "@/features/habits/hooks/useHabitSync";
import type { Habit, HabitEntry } from "@/features/habits/lib/types";

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
  const [notesHabit, setNotesHabit] = useState<Habit | null>(null);
  const [areaFilter, setAreaFilter] = useState(""); // "" = all, "__none__" = no area

  // Import-from-JSON: a hidden file input, a preview to confirm, a result note.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<{
    fileName: string;
    habits: Habit[];
    entries: HabitEntry[];
    newHabits: number;
    newEntries: number;
  } | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!importMsg) return;
    const t = setTimeout(() => setImportMsg(null), 6000);
    return () => clearTimeout(t);
  }, [importMsg]);

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    const parsed = habitsFromJson(await file.text());
    if (!parsed) {
      setImportMsg("That file didn’t look like a habits JSON export.");
      return;
    }
    const haveH = new Set(h.allHabits.map((x) => x.id));
    const haveE = new Set(h.entries.map((x) => x.id));
    setImportPreview({
      fileName: file.name,
      habits: parsed.habits,
      entries: parsed.entries,
      newHabits: parsed.habits.filter((x) => !haveH.has(x.id)).length,
      newEntries: parsed.entries.filter((x) => !haveE.has(x.id)).length,
    });
  };

  const applyImport = () => {
    if (!importPreview) return;
    const res = h.importData(importPreview.habits, importPreview.entries);
    setImportPreview(null);
    setImportMsg(
      res.addedHabits + res.addedEntries === 0
        ? "Nothing new to import — it was all already here."
        : `Imported ${res.addedHabits} habit${res.addedHabits === 1 ? "" : "s"} and ${res.addedEntries} log${res.addedEntries === 1 ? "" : "s"}.`
    );
  };

  // How many noted days each habit has — to surface its note timeline.
  const noteCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of h.entries) {
      if (e.note?.trim()) m.set(e.habitId, (m.get(e.habitId) ?? 0) + 1);
    }
    return m;
  }, [h.entries]);

  useEffect(() => {
    if (h.today) setSelectedDay((cur) => cur || h.today);
  }, [h.today]);

  // First run: offer templates once, for a brand-new (empty) tracker. Wait for
  // the cloud so an existing user's habits aren't mistaken for an empty tracker,
  // and confirm the dismissal flag against the cloud (survives cache eviction).
  useEffect(() => {
    if (!h.hydrated || !h.cloudLoaded) return;
    if (h.allHabits.length > 0) return;
    let cancelled = false;
    fetchUiFlag("habitsOnboarded").then((seen) => {
      if (cancelled || seen) return;
      setOnboardOpen(true);
      // First-run only: remember as soon as it's shown so it never replays
      // (a reload, or an evicted cache the cloud later backstops).
      markUiFlag("habitsOnboarded");
    });
    return () => {
      cancelled = true;
    };
  }, [h.hydrated, h.cloudLoaded, h.allHabits.length]);

  const markSeen = () => markUiFlag("habitsOnboarded");

  const nextSortOrder =
    h.allHabits.reduce((m, x) => Math.max(m, x.sortOrder), -1) + 1;

  // Areas (categories) — derived from the habits that carry an `area` label.
  const areas = useMemo(() => deriveAreas(h.allHabits), [h.allHabits]);
  const areaIcons = useMemo(() => areaIconByName(h.allHabits), [h.allHabits]);
  const hasAreas = areas.length > 0;
  const someUncategorized = h.habits.some((x) => !x.area?.trim());
  const visibleHabits = h.habits.filter((x) => {
    if (!areaFilter) return true;
    if (areaFilter === "__none__") return !x.area?.trim();
    return x.area?.trim() === areaFilter;
  });

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
    onEdit: openEdit,
  };

  const empty = h.hydrated && h.allHabits.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Heading */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-50">
            Habits
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Small, repeatable wins — the record of who you&apos;re becoming.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <HabitsViewToggle />
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

      {importMsg && (
        <p className="self-start rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300">
          {importMsg}
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
          <SectionNav
            items={[
              { id: "hsec-summary", label: "Summary" },
              ...(dueCount > 0
                ? [{ id: "hsec-today", label: "Today" }]
                : []),
              { id: "hsec-habits", label: "Habits" },
              { id: "hsec-insights", label: "Insights" },
              { id: "hsec-focus", label: "Focus" },
            ] as SectionNavItem[]}
          />

          {/* Summary */}
          <section
            id="hsec-summary"
            className="scroll-mt-20 rounded-2xl border border-slate-800/70 bg-slate-900/85 p-4 shadow-sm sm:p-8"
          >
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
            <section id="hsec-today" className="scroll-mt-20">
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
                    canUndo={h.undoableIds.has(habit.id)}
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
                          canUndo={h.undoableIds.has(habit.id)}
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
          <section
            id="hsec-habits"
            className="scroll-mt-20 rounded-2xl border border-slate-800/70 bg-slate-900/85 p-4 shadow-sm sm:p-8"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                All habits
              </h3>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <button
                  type="button"
                  onClick={() =>
                    downloadText(
                      `habits-${todayKey()}.csv`,
                      entriesToCsv(h.allHabits, h.entries),
                      "text/csv"
                    )
                  }
                  className="transition hover:text-slate-300"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadText(
                      `habits-${todayKey()}.json`,
                      habitsToJson(h.allHabits, h.entries, new Date().toISOString()),
                      "application/json"
                    )
                  }
                  className="transition hover:text-slate-300"
                >
                  JSON
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="transition hover:text-slate-300"
                >
                  Import
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={onImportFile}
                  className="hidden"
                />
                {h.archived.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowArchived((v) => !v)}
                    className="transition hover:text-slate-300"
                  >
                    {showArchived ? "Hide" : "Show"} archived ({h.archived.length})
                  </button>
                )}
              </div>
            </div>
            {/* Nudge once there are habits but no areas yet. */}
            {!hasAreas && h.habits.length > 0 && (
              <p className="mb-3 text-[11px] text-slate-500">
                Tip: give a habit an{" "}
                <span className="text-slate-300">Area</span> (Edit → Area) to
                group and filter them.
              </p>
            )}
            {/* Area filter — only once habits carry area labels. */}
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
            <div className="flex flex-col gap-2">
              {visibleHabits.map((habit) => {
                const st = h.statsByHabit.get(habit.id)!;
                return (
                  <div
                    key={habit.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5"
                  >
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-lg"
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
                        {scheduleLabel(habit)} · 🔥 {st.currentStreak} · {st.rate}%
                        {" · 💪 "}{st.strength}%
                        {habit.reminder ? ` · 🔔 ${habit.reminder}` : ""}
                        {(noteCounts.get(habit.id) ?? 0) > 0 && (
                          <>
                            {" · "}
                            <button
                              type="button"
                              onClick={() => setNotesHabit(habit)}
                              className="underline-offset-2 transition hover:text-slate-300 hover:underline"
                            >
                              🗒 {noteCounts.get(habit.id)}
                            </button>
                          </>
                        )}
                      </p>
                    </div>
                    <RowMenu
                      label={`Options for ${habit.name}`}
                      items={[
                        {
                          label: "Start focus",
                          icon: <Timer className="h-4 w-4 text-slate-400" />,
                          onClick: () => launchFocus(habit),
                        },
                        {
                          label: "Edit",
                          icon: <Pencil className="h-4 w-4 text-slate-400" />,
                          onClick: () => openEdit(habit),
                        },
                        {
                          label: "Archive",
                          icon: <Archive className="h-4 w-4 text-slate-400" />,
                          onClick: () => h.setArchived(habit.id, true),
                        },
                        {
                          label: "Delete",
                          icon: <Trash className="h-4 w-4" />,
                          onClick: () => removeHabitConfirmed(habit),
                          danger: true,
                        },
                      ]}
                    />
                  </div>
                );
              })}
            </div>

            {showArchived &&
              h.archived.map((habit) => (
                <div key={habit.id} className="flex items-center gap-3 border-t border-slate-800/60 py-2.5 opacity-70">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-lg">
                    <Emoji>{habitEmoji(habit)}</Emoji>
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
          <div id="hsec-insights" className="scroll-mt-20">
            <InsightsPanel
              habits={h.habits}
              statsByHabit={h.statsByHabit}
              entries={h.entries}
              dayCounts={h.dayCounts}
              today={h.today}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              onRemoveEntry={(habit, entry) => h.clearEntryFor(habit, entry.day)}
              onLogEntry={(habit, day, detail) => h.logEntryFor(habit, day, detail)}
            />
          </div>

          {/* The moat: how habits line up with focus output */}
          <div id="hsec-focus" className="scroll-mt-20">
            <FocusCorrelationCard
              habits={h.allHabits}
              entries={h.entries}
              sessions={sessions}
              today={h.today}
            />
          </div>
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
      <HabitNotesModal
        open={Boolean(notesHabit)}
        onClose={() => setNotesHabit(null)}
        habit={notesHabit}
        entries={h.entries}
        today={h.today}
      />
      <Modal
        open={Boolean(importPreview)}
        onClose={() => setImportPreview(null)}
        labelledBy="habit-import-title"
        panelClassName="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
      >
        {importPreview && (
          <>
            <h2
              id="habit-import-title"
              className="text-lg font-semibold tracking-tight text-slate-50"
            >
              Import habits
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              From{" "}
              <span className="text-slate-200">{importPreview.fileName}</span>
            </p>
            <ul className="mt-4 flex flex-col gap-1.5 text-sm text-slate-300">
              <li>
                <span className="tabular-nums text-slate-100">
                  {importPreview.newHabits}
                </span>{" "}
                new habit{importPreview.newHabits === 1 ? "" : "s"}{" "}
                <span className="text-slate-500">
                  ({importPreview.habits.length} in file)
                </span>
              </li>
              <li>
                <span className="tabular-nums text-slate-100">
                  {importPreview.newEntries}
                </span>{" "}
                new log{importPreview.newEntries === 1 ? "" : "s"}{" "}
                <span className="text-slate-500">
                  ({importPreview.entries.length} in file)
                </span>
              </li>
            </ul>
            <p className="mt-2 text-[11px] text-slate-500">
              Your current habits and logs are kept — anything already here is
              skipped.
            </p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyImport}
                disabled={
                  importPreview.newHabits + importPreview.newEntries === 0
                }
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
              >
                Import
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

export default HabitsDashboard;
