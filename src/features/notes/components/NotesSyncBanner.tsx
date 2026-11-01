"use client";

// Shown only while this device isn't connected to sync — the same banner the
// other pillars show. Connected, it renders nothing: notes sync live.
export function NotesSyncBanner({
  email,
  connected,
  connecting,
  error,
  connect,
}: {
  email: string | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => void;
}) {
  if (connected) return null;
  return (
    <div className="mx-3 flex flex-col gap-2 rounded-xl border border-slate-800/70 bg-slate-900/80 px-4 py-3 sm:mx-0 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-400">
        Your notes stay on this device.{" "}
        <span className="text-slate-300">Sync to save them to your account.</span>
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
  );
}
