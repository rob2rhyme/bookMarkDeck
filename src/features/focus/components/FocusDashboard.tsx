"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { Settings, Timer } from "@/components/icons";
import { ActivityHistory } from "@/features/focus/components/ActivityHistory";
import { AnalysisPanel } from "@/features/focus/components/AnalysisPanel";
import { FocusSettingsModal } from "@/features/focus/components/FocusSettingsModal";
import { HydrationTracker } from "@/features/focus/components/HydrationTracker";
import { JournalCard } from "@/features/focus/components/JournalCard";
import { PomodoroTimer } from "@/features/focus/components/PomodoroTimer";
import { QuoteBox } from "@/features/focus/components/QuoteBox";
import { TaskTracker } from "@/features/focus/components/TaskTracker";
import { useFocusActivity } from "@/features/focus/hooks/useFocusActivity";
import { useFocusJournal } from "@/features/focus/hooks/useFocusJournal";
import { useFocusSettings } from "@/features/focus/hooks/useFocusSettings";
import { useFocusStats } from "@/features/focus/hooks/useFocusStats";
import { useFocusSync } from "@/features/focus/hooks/useFocusSync";
import { useFocusTasks } from "@/features/focus/hooks/useFocusTasks";
import { useHydration } from "@/features/focus/hooks/useHydration";

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
  const tasks = useFocusTasks(email, connected, activity.log);
  const journal = useFocusJournal(email, connected, activity.log);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statsKey, setStatsKey] = useState(0);
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
    ]);
    setStatsKey((k) => k + 1);
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
    ]);
    setStatsKey((k) => k + 1);
    setSyncing(false);
    setSyncMsg("Loaded from cloud just now.");
  };

  const stats = useFocusStats(email, connected, statsKey);
  const hydration = useHydration({
    email,
    enabled: settings.hydrationEnabled,
    intervalMin: settings.hydrationIntervalMin,
    goal: settings.waterGoal,
    soundEnabled: settings.soundEnabled,
    onLog: activity.log,
  });

  const taskNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of [...tasks.activeTasks, ...tasks.doneTasks]) {
      map[t.id] = t.text;
    }
    return map;
  }, [tasks.activeTasks, tasks.doneTasks]);

  const onFocusComplete = (_focusMin: number, taskId: string | null) => {
    setStatsKey((k) => k + 1);
    if (taskId) tasks.markUsed(taskId, new Date().toISOString());
    setJournalPrompt(true);
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
          onToggleDone={tasks.toggleDone}
          onRemove={tasks.removeTask}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AnalysisPanel
          available={stats.available}
          todayFocusMin={stats.todayFocusMin}
          todaySessions={stats.todaySessions}
          dailyGoalHours={settings.dailyGoalHours}
          streak={stats.streak}
          totalSessions={stats.totalSessions}
          totalFocusMin={stats.totalFocusMin}
          last7={stats.last7}
          weekFocusMin={stats.weekFocusMin}
          weekSessions={stats.weekSessions}
          weekTaskMin={stats.weekTaskMin}
          taskNameById={taskNameById}
          moodByDay={journal.moodByDay}
        />
        <JournalCard
          note={journal.todayNote}
          mood={journal.todayMood}
          onNoteChange={journal.setNote}
          onMoodChange={(m) => {
            journal.setMood(m);
            setJournalPrompt(false);
          }}
          highlight={journalPrompt}
        />
      </div>

      <div className="mt-5">
        <ActivityHistory
          available={stats.available}
          sessions={stats.sessions}
          events={activity.events}
          taskNameById={taskNameById}
          moodByDay={journal.moodByDay}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
        <QuoteBox />
      </div>

      <div className="mt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
        >
          Back to bookmarks
        </Link>
      </div>

      <FocusSettingsModal
        open={settingsOpen}
        settings={settings}
        onUpdate={update}
        onReset={reset}
        onClose={() => setSettingsOpen(false)}
      />
    </section>
  );
}

export default FocusDashboard;
