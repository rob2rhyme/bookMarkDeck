"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { Timer } from "@/components/icons";
import { useBookmarks } from "@/hooks/useBookmarks";
import { CollectionPicker } from "@/features/focus/components/CollectionPicker";
import { PomodoroTimer } from "@/features/focus/components/PomodoroTimer";
import { ResourcesPanel } from "@/features/focus/components/ResourcesPanel";
import { SessionTasks } from "@/features/focus/components/SessionTasks";
import { useFocusSync } from "@/features/focus/hooks/useFocusSync";

type FocusDashboardProps = {
  initialCollectionId?: string | null;
};

/**
 * Focus hub. Phase 4: a focus session can link to one of the user's bookmark
 * folders; that collection's bookmarks show in a read-only Resources panel, and
 * the linked folder is recorded on completed sessions.
 */
export function FocusDashboard({ initialCollectionId }: FocusDashboardProps) {
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;
  const { connected, connecting, error, connect } = useFocusSync(email);

  // Read-only access to the existing bookmark/folder data (never mutated here).
  const { bookmarks, folders } = useBookmarks(email);

  const [collectionId, setCollectionId] = useState<string | null>(
    initialCollectionId ?? null
  );

  // Only honor a collection id that actually exists for this user.
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
        <CollectionPicker
          folders={folders}
          value={linkedFolderId}
          onChange={setCollectionId}
        />
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

      <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <PomodoroTimer
          email={email}
          connected={connected}
          linkedFolderId={linkedFolderId}
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

      <div className="mt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
        >
          Back to bookmarks
        </Link>
      </div>
    </section>
  );
}

export default FocusDashboard;
