"use client";

// Error boundary for the authenticated app. Renders inside <AppShell> (header
// + footer stay), so this is a content-area fallback rather than a full page.

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] section error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-800/70 bg-slate-900/85 p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Something went wrong
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">
          This page hit an error
        </h2>
        <p className="mt-3 text-sm text-slate-400">
          Your synced data is safe. Try reloading this section, or go back home.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[11px] text-slate-500">
            Ref: {error.digest}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          >
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
