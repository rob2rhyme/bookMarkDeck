import Link from "next/link";

export default function OfflinePage() {
  return (
    <section className="mx-auto w-full max-w-2xl">
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/50 p-6 text-slate-200 shadow-2xl ring-1 ring-white/5 backdrop-blur-md sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
          Offline
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">
          You are offline
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          Bookmark Deck can still render cached screens, but live sync and cloud
          operations require a network connection.
        </p>
        <div className="mt-5">
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/70 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:border-blue-400 hover:text-white"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </section>
  );
}
