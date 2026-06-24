"use client";

// Calm sync indicator for the Simple view — replaces the contradictory
// "you're signed in but must Connect" banner. Reflects useHabitSync state.
// "Synced" means the cloud account is connected (writes are optimistic, like
// the rest of the app). An existing Firebase session (from bookmarks/focus) is
// reflected automatically; otherwise the disconnected state is a one-tap connect
// so the Google popup only ever opens from a real user gesture (never on load).

type SyncStatusChipProps = {
  /** Whether the user is signed in to next-auth (an account exists to sync to). */
  signedIn: boolean;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  onConnect: () => void;
};

const PILL =
  "inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-400";

export function SyncStatusChip({
  signedIn,
  connected,
  connecting,
  error,
  onConnect,
}: SyncStatusChipProps) {
  if (error && !connected) {
    return (
      <button
        type="button"
        onClick={onConnect}
        title={error}
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:border-amber-400"
      >
        <span aria-hidden="true">⚠</span> Couldn&apos;t sync — retry
      </button>
    );
  }

  if (connecting) {
    return (
      <span className={PILL}>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" aria-hidden="true" />
        Syncing…
      </span>
    );
  }

  if (connected) {
    return (
      <span className={PILL} title="Connected to your account — changes save to the cloud.">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
        Synced
      </span>
    );
  }

  // Not connected. If signed in, offer a one-tap connect (explicit gesture so
  // the Google popup is allowed). If not signed in, just state where data lives.
  if (signedIn) {
    return (
      <button
        type="button"
        onClick={onConnect}
        title="Saved on this device. Tap to sync to your account across devices."
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 transition hover:border-blue-400 hover:text-blue-300"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-slate-500" aria-hidden="true" />
        Saved on this device · Sync
      </button>
    );
  }

  return (
    <span className={PILL} title="Your habits are saved on this device.">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-500" aria-hidden="true" />
      Saved on this device
    </span>
  );
}

export default SyncStatusChip;
