// Custom 404 — a calm, branded fallback with a way back, instead of the bare
// default. Renders in the root layout (no AppShell), matching the error page.
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-6 text-slate-50">
      <div className="w-full max-w-md rounded-2xl border border-slate-800/70 bg-slate-900/85 p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          404
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          This page wandered off
        </h1>
        <p className="mt-3 text-sm text-slate-400">
          The link may be broken or the page may have moved. Let&apos;s get you
          back on track.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            Back home
          </Link>
          <Link
            href="/guide"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          >
            Read the guide
          </Link>
        </div>
      </div>
    </main>
  );
}
