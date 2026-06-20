"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { Settings, Timer } from "@/components/icons";
import { useBookmarks } from "@/hooks/useBookmarks";
import { CollectionPicker } from "@/features/focus/components/CollectionPicker";
import { FocusSettingsModal } from "@/features/focus/components/FocusSettingsModal";
import { HydrationTracker } from "@/features/focus/components/HydrationTracker";
import { PomodoroTimer } from "@/features/focus/components/PomodoroTimer";
import { QuoteBox } from "@/features/focus/components/QuoteBox";
import { ResourcesPanel } from "@/features/focus/components/ResourcesPanel";
import { SessionTasks } from "@/features/focus/components/SessionTasks";
import { StatsPanel } from "@/features/focus/components/StatsPanel";
import { useFocusSettings } from "@/features/focus/hooks/useFocusSettings";
import { useFocusStats } from "@/features/focus/hooks/useFocusStats";
import { useFocusSync } from "@/features/focus/hooks/useFocusSync";
import { useHydration } from "@/features/focus/hooks/useHydration";

type FocusDashboardProps = {
  initialCollectionId?: string | null;
};

export function FocusDashboard({ initialCollectionId }: FocusDashboardProps) {
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;
  const { connected, connecting, error, connect } = useFocusSync(email);

  const { settings, update, reset } = useFocusSettings(email, connected);
  const { bookmarks, folders } = useBookmarks(email);

  const [collectionId, setCollectionId] = useState<string | null>(
    initialCollectionId ?? null
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statsKey, setStatsKey] = useState(0);

  const stats = useFocusStats(email, connected, statsKey);
  const hydration = useHydration({
    email,
    enabled: settings.hydrationEnabled,
    intervalMin: settings.hydrationIntervalMin,
    goal: settings.waterGoal,
    soundEnabled: settings.soundEnabled,
  });

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === collectionId) ?? null,
    [folders, collectionId]
  );
  const linkedFolderId = selectedFolder?.id ?? null;

  const collectionBookmarks = useMemo(
    () =>
      linkedFolderId
        ? bookmarks.filter((bookmark) => bookmark.folderId === linkedFolderId)
        : [],
    [bookmarks, linkedFolderId]
  );

  return (
    <section className="flex flex-1 flex-col">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 text-blue-400">
            <Timer className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">
              Focus
            </h2>
            <p className="text-sm text-slate-400">
              A calm space to do the work, with your resources close by.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CollectionPicker
            folders={folders}
            value={linkedFolderId}
            onChange={setCollectionId}
          />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Focus settings"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-blue-400 hover:text-blue-300"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!connected && (
        <div className="mb-5 flex flex-col gap-2 rounded-xl border border-slate-800/70 bg-slate-900/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <PomodoroTimer
          settings={settings}
          email={email}
          connected={connected}
          linkedFolderId={linkedFolderId}
          onFocusComplete={() => setStatsKey((k) => k + 1)}
        />
        <SessionTasks email={email} connected={connected} />
      </div>

      {selectedFolder && (
        <div className="mt-5">
          <ResourcesPanel
            folderName={selectedFolder.name}
            bookmarks={collectionBookmarks}
          />
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <StatsPanel
          available={stats.available}
          todaySessions={stats.todaySessions}
          todayFocusMin={stats.todayFocusMin}
          streak={stats.streak}
          totalSessions={stats.totalSessions}
          totalFocusMin={stats.totalFocusMin}
          last7={stats.last7}
          byCollection={stats.byCollection}
          folders={folders}
        />
        {settings.hydrationEnabled ? (
          <HydrationTracker
            glasses={hydration.glasses}
            goal={hydration.goal}
            reminding={hydration.reminding}
            onDrink={hydration.drink}
            onRemove={hydration.removeGlass}
            onDismiss={hydration.dismiss}
          />
        ) : (
          <QuoteBox />
        )}
      </div>

      {settings.hydrationEnabled && (
        <div className="mt-5">
          <QuoteBox />
        </div>
      )}

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
