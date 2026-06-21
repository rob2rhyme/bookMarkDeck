"use client";

// Root error boundary — catches render/runtime errors anywhere in the app and
// shows a calm, branded fallback instead of a blank screen. Logged so failures
// stay diagnosable in the console (and any attached error reporter).

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-6 text-slate-50">
      <div className="w-full max-w-md rounded-2xl border border-slate-800/70 bg-slate-900/85 p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Something went wrong
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          We hit an unexpected error
        </h1>
        <p className="mt-3 text-sm text-slate-400">
          Your data is safe. Try again, or head back to your deck.
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
    </main>
  );
}
