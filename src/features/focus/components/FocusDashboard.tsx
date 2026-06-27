"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import { consumeFocusTaskIntent } from "@/lib/focusIntent";

import { Settings, Timer } from "@/components/icons";
import {
  ActivityHistory,
  type ActivityRef,
} from "@/features/focus/components/ActivityHistory";
import { AnalysisPanel } from "@/features/focus/components/AnalysisPanel";
import { DreamPanel } from "@/features/focus/components/DreamPanel";
import { FocusSettingsModal } from "@/features/focus/components/FocusSettingsModal";
import { HydrationHistory } from "@/features/focus/components/HydrationHistory";
import { HydrationTracker } from "@/features/focus/components/HydrationTracker";
import { JournalCard } from "@/features/focus/components/JournalCard";
import { LogPastSessionModal } from "@/features/focus/components/LogPastSessionModal";
import { PomodoroTimer } from "@/features/focus/components/PomodoroTimer";
import { QuoteBox } from "@/features/focus/components/QuoteBox";
import { ScoresPanel } from "@/features/focus/components/ScoresPanel";
import { TaskTracker } from "@/features/focus/components/TaskTracker";
import { TodoHistory } from "@/features/focus/components/TodoHistory";
import { TodoList } from "@/features/focus/components/TodoList";
import { UndoToast } from "@/features/focus/components/UndoToast";
import { useFocusActivity } from "@/features/focus/hooks/useFocusActivity";
import { useFocusJournal } from "@/features/focus/hooks/useFocusJournal";
import { useFocusScores, type QuizResult } from "@/features/focus/hooks/useFocusScores";
import { useFocusSettings } from "@/features/focus/hooks/useFocusSettings";
import { useFocusStats } from "@/features/focus/hooks/useFocusStats";
import { isTopicId, topicLabel } from "@/features/focus/lib/topics";
import { useFocusSync } from "@/features/focus/hooks/useFocusSync";
import { useFocusTasks } from "@/features/focus/hooks/useFocusTasks";
import { useHydration } from "@/features/focus/hooks/useHydration";
import { useHydrationHistory } from "@/features/focus/hooks/useHydrationHistory";
import { AgendaCard } from "@/features/focus/components/AgendaCard";
import { useGoogleEvents } from "@/features/focus/hooks/useGoogleEvents";
import { useGoogleTodoSync } from "@/features/focus/hooks/useGoogleTodoSync";
import { useTodos } from "@/features/focus/hooks/useTodos";
import { useUndo } from "@/features/focus/hooks/useUndo";
import { restoreFocusBackup, todayKey } from "@/features/focus/data/focusData";
import {
  backupCount,
  focusFromJson,
  focusToJson,
  sessionsToCsv,
} from "@/features/focus/lib/exportFocus";
import { Modal } from "@/components/Modal";
import { downloadText } from "@/utils/download";
import type {
  FocusBackup,
  FocusTask,
  JournalNote,
  Todo,
} from "@/features/focus/lib/types";

export function FocusDashboard() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;
  const { connected, connecting, error, connect } = useFocusSync(email);

  const {
    settings,
    update,
    reset,
    pullFromCloud: pullSettings,
    pushToCloud: pushSettings,
  } = useFocusSettings(email, connected);
  const activity = useFocusActivity(email, connected);
  const scores = useFocusScores(email, connected);
  const tasks = useFocusTasks(email, connected, activity.log);

  // A quiz answer feeds both histories: points to Scores, a timeline entry to
  // Activity.
  const onQuizAnswered = (r: QuizResult) => {
    scores.record(r);
    const name = isTopicId(r.topic) ? topicLabel(r.topic) : r.topic;
    activity.log(
      "quiz",
      r.correct ? `${name} quiz — correct (+${r.points})` : `${name} quiz — missed`,
      todayKey()
    );
  };
  const journal = useFocusJournal(email, connected, activity.log);
  const todos = useTodos(email, connected, activity.log);
  const gsync = useGoogleTodoSync(settings.todoGoogleSync, todos.setGoogleIds);
  const gevents = useGoogleEvents(settings.todoGoogleSync);
  const hydration = useHydration({
    email,
    connected,
    enabled: settings.hydrationEnabled,
    intervalMin: settings.hydrationIntervalMin,
    goal: settings.waterGoal,
    soundEnabled: settings.soundEnabled,
    onLog: activity.log,
  });
  const hydrationHistory = useHydrationHistory(email, connected);

  const undo = useUndo();

  // Cross-feature handoff: if the user clicked "Work on this" on a bookmark,
  // seed + activate that task once on arrival. consume() clears the intent, so
  // this is idempotent across re-renders.
  const addTaskRef = useRef(tasks.addTask);
  addTaskRef.current = tasks.addTask;
  useEffect(() => {
    const seed = consumeFocusTaskIntent();
    if (seed) addTaskRef.current(seed);
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pastSessionOpen, setPastSessionOpen] = useState(false);
  const [journalPrompt, setJournalPrompt] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const syncToCloud = async () => {
    setSyncing(true);
    setSyncMsg("Saving to cloud…");
    await Promise.allSettled([
      tasks.pushToCloud(),
      pushSettings(),
      journal.pushToCloud(),
      hydration.pushToCloud(),
      todos.pushToCloud(),
    ]);
    setSyncing(false);
    setSyncMsg("Saved to cloud just now.");
  };

  const syncFromCloud = async () => {
    setSyncing(true);
    setSyncMsg("Loading from cloud…");
    await Promise.allSettled([
      tasks.pullFromCloud(),
      pullSettings(),
      journal.pullFromCloud(),
      hydration.pullFromCloud(),
      todos.pullFromCloud(),
    ]);
    setSyncing(false);
    setSyncMsg("Loaded from cloud just now.");
  };

  const [weekOffset, setWeekOffset] = useState(0);
  const stats = useFocusStats(email, connected, weekOffset);

  // Full backup payload for "Export all data (JSON)" / import round-trip.
  const buildBackup = (): FocusBackup => ({
    sessions: stats.sessions,
    tasks: [...tasks.activeTasks, ...tasks.doneTasks],
    notes: journal.notesByDay.flatMap((d) => d.notes),
    moods: Object.entries(journal.moodByDay).map(([day, mood]) => ({
      day,
      mood,
    })),
    hydration: hydrationHistory,
    todos: todos.todos,
    scores: scores.scores,
  });

  // Import-from-JSON: parse → preview → restore (id-preserving, idempotent).
  const [focusImport, setFocusImport] = useState<{
    fileName: string;
    backup: FocusBackup;
  } | null>(null);
  const [focusImporting, setFocusImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!importMsg) return;
    const t = setTimeout(() => setImportMsg(null), 6000);
    return () => clearTimeout(t);
  }, [importMsg]);

  const onImportJson = async (file: File) => {
    setSettingsOpen(false);
    const backup = focusFromJson(await file.text());
    if (!backup) {
      setImportMsg("That file didn’t look like a focus JSON backup.");
      return;
    }
    setFocusImport({ fileName: file.name, backup });
  };

  const applyFocusImport = async () => {
    if (!focusImport) return;
    if (!connected || !email) {
      setFocusImport(null);
      setImportMsg("Sign in to sync first, then import your backup.");
      return;
    }
    setFocusImporting(true);
    await restoreFocusBackup(email, focusImport.backup);
    setFocusImporting(false);
    const n = backupCount(focusImport.backup);
    setFocusImport(null);
    setImportMsg(`Imported ${n} record${n === 1 ? "" : "s"} from your backup.`);
  };

  const taskNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of [...tasks.activeTasks, ...tasks.doneTasks]) {
      map[t.id] = t.text;
    }
    return map;
  }, [tasks.activeTasks, tasks.doneTasks]);

  // Today's drink events drive the intraday "Day" hydration chart.
  const todayHydrationEvents = useMemo(() => {
    const today = todayKey();
    return activity.events.filter(
      (e) => e.type === "hydration" && e.day === today
    );
  }, [activity.events]);

  const onFocusComplete = (_focusMin: number, taskId: string | null) => {
    if (taskId) tasks.markUsed(taskId, new Date().toISOString());
    setJournalPrompt(true);
  };

  const deleteActivityItem = (ref: ActivityRef) => {
    if (ref.source === "session") stats.removeSession(ref.record.id);
    else activity.remove(ref.record.id);
  };

  const restoreActivityItem = (ref: ActivityRef) => {
    if (ref.source === "session") stats.restoreSession(ref.record);
    else activity.restore(ref.record);
  };

  const removeTaskWithUndo = (task: FocusTask) => {
    tasks.removeTask(task.id);
    undo.offer(`Task “${task.text}” deleted`, () => tasks.restoreTask(task));
  };

  const removeNoteWithUndo = (note: JournalNote) => {
    journal.removeNote(note.id);
    undo.offer("Journal note deleted", () => journal.restoreNote(note));
  };

  const addTodoSynced = (text: string, dueAt: string | null, note: string) => {
    const created = todos.addTodo(text, dueAt, note);
    if (created) gsync.mirror(created);
  };

  const editTodoSynced = (
    id: string,
    patch: { text?: string; note?: string; dueAt?: string | null }
  ) => {
    todos.editTodo(id, patch);
    const existing = todos.todos.find((t) => t.id === id);
    if (existing) {
      gsync.mirror({
        ...existing,
        ...patch,
        text: patch.text !== undefined ? patch.text.trim() : existing.text,
      });
    }
  };

  const removeTodoWithUndo = (todo: Todo) => {
    todos.removeTodo(todo.id);
    gsync.unmirror(todo);
    undo.offer(`To-do “${todo.text}” deleted`, () => {
      todos.restoreTodo(todo);
      gsync.mirror(todo);
    });
  };

  // Toggle a to-do; when marking one done, offer an undo to un-complete it.
  const toggleTodoWithUndo = (todo: Todo) => {
    todos.toggleTodo(todo.id);
    gsync.mirror({ ...todo, done: !todo.done });
    if (!todo.done) {
      undo.offer(`“${todo.text}” done`, () => {
        todos.toggleTodo(todo.id);
        gsync.mirror(todo);
      });
    }
  };

  const todayCalendarEvents = useMemo(() => {
    const today = todayKey();
    return gevents.events.filter((e) => {
      if (!e.start) return false;
      const d = new Date(e.start);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return k === today;
    });
  }, [gevents.events]);

  const todoEvents = useMemo(
    () =>
      activity.events.filter(
        (e) => e.type === "todo_added" || e.type === "todo_done"
      ),
    [activity.events]
  );

  const removeNotesWithUndo = (notes: JournalNote[]) => {
    notes.forEach((n) => journal.removeNote(n.id));
    undo.offer(
      notes.length === 1 ? "Journal note deleted" : `${notes.length} notes deleted`,
      () => notes.forEach((n) => journal.restoreNote(n))
    );
  };

  return (
    <section className="flex flex-1 flex-col">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 text-blue-400">
            <Timer className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">
              Focus
            </h2>
            <p className="truncate text-sm text-slate-400">
              Track your work, one focused block at a time.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Focus settings"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-blue-400 hover:text-blue-300"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {!connected ? (
        <div className="mb-5 flex flex-col gap-2 rounded-xl border border-slate-800/70 bg-slate-900/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-400">
            Your focus data stays on this device.{" "}
            <span className="text-slate-300">Sync to save it to your account.</span>
            {error && <span className="block text-xs text-red-400">{error}</span>}
          </p>
          <button
            type="button"
            onClick={connect}
            disabled={connecting || !email}
            className="shrink-0 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {connecting ? "Connecting…" : "Sign in to sync"}
          </button>
        </div>
      ) : (
        <div className="mb-5 flex flex-col gap-2 rounded-xl border border-slate-800/70 bg-slate-900/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-400">
            <span className="text-emerald-400">●</span> Synced to your account —
            changes save automatically.
            {syncMsg && <span className="ml-1.5 text-slate-300">{syncMsg}</span>}
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={syncFromCloud}
              disabled={syncing}
              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300 disabled:opacity-50"
            >
              Sync from cloud
            </button>
            <button
              type="button"
              onClick={syncToCloud}
              disabled={syncing}
              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300 disabled:opacity-50"
            >
              Sync to cloud
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <PomodoroTimer
          settings={settings}
          email={email}
          connected={connected}
          activeTaskId={tasks.activeTaskId}
          activeTaskName={tasks.activeTask?.text ?? null}
          onFocusComplete={onFocusComplete}
        />
        <TaskTracker
          activeTasks={tasks.activeTasks}
          doneTasks={tasks.doneTasks}
          activeTaskId={tasks.activeTaskId}
          byTask={stats.byTask}
          onSelect={tasks.setActiveTaskId}
          onAdd={tasks.addTask}
          onRename={tasks.renameTask}
          onToggleDone={tasks.toggleDone}
          onRemove={removeTaskWithUndo}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <TodoList
          active={todos.active}
          done={todos.done}
          todayEvents={todayCalendarEvents}
          onAdd={addTodoSynced}
          onToggle={toggleTodoWithUndo}
          onEdit={editTodoSynced}
          onRemove={removeTodoWithUndo}
        />
        {settings.todoGoogleSync ? (
          <AgendaCard
            enabled
            events={gevents.events}
            loading={gevents.loading}
            error={gevents.error}
            days={gevents.days}
            canExpand={gevents.canExpand}
            canCollapse={gevents.canCollapse}
            onRefresh={gevents.refresh}
            onExpand={gevents.expand}
            onCollapse={gevents.collapse}
          />
        ) : (
          <TodoHistory available={connected} events={todoEvents} />
        )}
      </div>

      {settings.todoGoogleSync && (
        <div className="mt-5">
          <TodoHistory available={connected} events={todoEvents} />
        </div>
      )}

      {stats.available && (
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => setPastSessionOpen(true)}
            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
          >
            ＋ Log a past session
          </button>
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AnalysisPanel
          available={stats.available}
          loaded={stats.loaded}
          todayFocusMin={stats.todayFocusMin}
          todaySessions={stats.todaySessions}
          dailyGoalHours={settings.dailyGoalHours}
          streak={stats.streak}
          totalSessions={stats.totalSessions}
          totalFocusMin={stats.totalFocusMin}
          last7={stats.last7}
          weekLabel={stats.weekLabel}
          isCurrentWeek={stats.isCurrentWeek}
          onPrevWeek={() => setWeekOffset((w) => w + 1)}
          onNextWeek={() => setWeekOffset((w) => Math.max(0, w - 1))}
          onResetWeek={() => setWeekOffset(0)}
          weekFocusMin={stats.weekFocusMin}
          prevWeekFocusMin={stats.prevWeekFocusMin}
          weekSessions={stats.weekSessions}
          weekTaskMin={stats.weekTaskMin}
          weekBookmarkMin={stats.weekBookmarkMin}
          taskNameById={taskNameById}
          moodByDay={journal.moodByDay}
          sessions={stats.sessions}
        />
        <JournalCard
          mood={journal.todayMood}
          moodByDay={journal.moodByDay}
          notesByDay={journal.notesByDay}
          onAddNote={journal.addNote}
          onEditNote={journal.editNote}
          onRemoveNote={removeNoteWithUndo}
          onRemoveNotes={removeNotesWithUndo}
          onMoodChange={(m, day) => {
            journal.setMood(m, day);
            setJournalPrompt(false);
          }}
          highlight={journalPrompt}
        />
      </div>

      <DreamPanel notesByDay={journal.notesByDay} />

      <div className="mt-5">
        <ActivityHistory
          available={stats.available}
          sessions={stats.sessions}
          events={activity.events}
          taskNameById={taskNameById}
          moodByDay={journal.moodByDay}
          onDelete={deleteActivityItem}
          onRestore={restoreActivityItem}
        />
      </div>

      {settings.hydrationEnabled && (
        <div className="mt-5">
          <HydrationHistory
            available={connected}
            history={hydrationHistory}
            todayEvents={todayHydrationEvents}
            goal={settings.waterGoal}
          />
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {settings.hydrationEnabled ? (
          <HydrationTracker
            cups={hydration.cups}
            oz={hydration.oz}
            goal={hydration.goal}
            goalOz={hydration.goalOz}
            reminding={hydration.reminding}
            onDrink={hydration.drink}
            onRemove={hydration.removeCup}
            onDismiss={hydration.dismiss}
          />
        ) : null}
        <QuoteBox
          email={email}
          connected={connected}
          interests={settings.interests}
          onQuizAnswered={onQuizAnswered}
        />
      </div>

      <div className="mt-5">
        <ScoresPanel
          available={connected}
          total={scores.total}
          answered={scores.answered}
          correctCount={scores.correctCount}
          byTopic={scores.byTopic}
          scores={scores.scores}
        />
      </div>

      <FocusSettingsModal
        open={settingsOpen}
        settings={settings}
        onUpdate={update}
        onReset={reset}
        onExportJson={() =>
          downloadText(
            `focus-data-${todayKey()}.json`,
            focusToJson(buildBackup(), new Date().toISOString()),
            "application/json"
          )
        }
        onImportJson={onImportJson}
        onExportCsv={() =>
          downloadText(
            `focus-sessions-${todayKey()}.csv`,
            sessionsToCsv(stats.sessions, taskNameById),
            "text/csv"
          )
        }
        onClose={() => setSettingsOpen(false)}
      />

      <LogPastSessionModal
        open={pastSessionOpen}
        onClose={() => setPastSessionOpen(false)}
        today={todayKey()}
        tasks={[...tasks.activeTasks, ...tasks.doneTasks]}
        onSave={(focusMin, day, taskId) =>
          stats.addSession(focusMin, day, taskId)
        }
      />

      <Modal
        open={Boolean(focusImport)}
        onClose={() => !focusImporting && setFocusImport(null)}
        labelledBy="focus-import-title"
        panelClassName="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
      >
        {focusImport && (
          <>
            <h2
              id="focus-import-title"
              className="text-lg font-semibold tracking-tight text-slate-50"
            >
              Import focus backup
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              From{" "}
              <span className="text-slate-200">{focusImport.fileName}</span>
            </p>
            <ul className="mt-4 flex flex-col gap-1 text-sm text-slate-300">
              {(
                [
                  ["Focus sessions", focusImport.backup.sessions.length],
                  ["Tasks", focusImport.backup.tasks.length],
                  ["Journal notes", focusImport.backup.notes.length],
                  ["Mood days", focusImport.backup.moods.length],
                  ["Hydration days", focusImport.backup.hydration.length],
                  ["To-dos", focusImport.backup.todos.length],
                  ["Quiz scores", focusImport.backup.scores.length],
                ] as [string, number][]
              )
                .filter(([, n]) => n > 0)
                .map(([label, n]) => (
                  <li key={label} className="flex justify-between gap-3">
                    <span className="text-slate-400">{label}</span>
                    <span className="tabular-nums text-slate-100">{n}</span>
                  </li>
                ))}
            </ul>
            <p className="mt-2 text-[11px] text-slate-500">
              Records merge by id, so re-importing the same backup changes
              nothing.
            </p>
            {!connected && (
              <p className="mt-2 text-[11px] text-amber-300/90">
                Sign in to sync first — import writes to your account.
              </p>
            )}
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setFocusImport(null)}
                disabled={focusImporting}
                className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyFocusImport}
                disabled={focusImporting || !connected}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
              >
                {focusImporting ? "Importing…" : "Import"}
              </button>
            </div>
          </>
        )}
      </Modal>

      {importMsg && (
        <div className="fixed bottom-4 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 shadow-xl">
          {importMsg}
        </div>
      )}

      <UndoToast state={undo.state} onUndo={undo.undo} onDismiss={undo.dismiss} />
    </section>
  );
}

export default FocusDashboard;
