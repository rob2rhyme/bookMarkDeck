"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

import { Timer } from "@/components/icons";
import { PomodoroTimer } from "@/features/focus/components/PomodoroTimer";
import { SessionTasks } from "@/features/focus/components/SessionTasks";
import { useFocusSync } from "@/features/focus/hooks/useFocusSync";

/**
 * Focus hub. Phase 3: Pomodoro timer + session tasks, persisted to Firestore
 * once the user connects sync (Firebase Auth). In-memory until then.
 */
export function FocusDashboard() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;
  const { connected, connecting, error, connect } = useFocusSync(email);

  return (
    <section className="flex flex-1 flex-col">
      <div className="mb-6 flex items-center gap-3">
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
        <PomodoroTimer email={email} connected={connected} />
        <SessionTasks email={email} connected={connected} />
      </div>

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
