"use client";

import Link from "next/link";

import { Timer } from "@/components/icons";

/**
 * Phase 1 placeholder for the focus hub. Proves the /focus route, auth gating,
 * and nav entry render inside the app shell. Timer + tasks land in Phase 2.
 */
export function FocusDashboard() {
  return (
    <section className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-800/70 bg-slate-900/60 p-8 shadow-sm sm:p-10">
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

        <div className="mt-6 rounded-xl border border-dashed border-slate-700/80 bg-slate-950/40 p-5">
          <p className="text-sm text-slate-300">
            The focus dashboard is coming together. Next up: a Pomodoro timer and
            a quick task list for the current session — then sessions that link to
            one of your bookmark collections, so the sites you saved are right
            here while you work.
          </p>
        </div>

        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
          >
            Back to bookmarks
          </Link>
        </div>
      </div>
    </section>
  );
}

export default FocusDashboard;
