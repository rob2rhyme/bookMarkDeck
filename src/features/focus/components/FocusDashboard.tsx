"use client";

import Link from "next/link";

import { Timer } from "@/components/icons";
import { PomodoroTimer } from "@/features/focus/components/PomodoroTimer";
import { SessionTasks } from "@/features/focus/components/SessionTasks";

/**
 * Focus hub. Phase 2: in-memory Pomodoro timer + current-session task list,
 * styled to the app shell. Persistence (Firestore) and the bookmark-collection
 * link come in later phases.
 */
export function FocusDashboard() {
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

      <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <PomodoroTimer />
        <SessionTasks />
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
