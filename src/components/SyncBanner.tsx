"use client";

import type { ReactNode } from "react";

/**
 * The sync status strip every cloud-backed page shows, so they say the same thing
 * the same way. Not connected: where the data lives and one button to change that.
 * Connected: a quiet "synced" line, plus the two manual buttons where a page has
 * them. A page with its own connected message (Filing, while papers load) passes
 * `connectedMessage`.
 *
 * Bookmarks is not one of them — it syncs by hand, by design — and keeps its own
 * controls.
 */
export function SyncBanner({
  subject,
  plural = false,
  email,
  connected,
  connecting,
  error,
  onConnect,
  syncing = false,
  onSyncFromCloud,
  onSyncToCloud,
  message,
  connectedMessage,
  hideWhenConnected = false,
  className = "",
}: {
  /** What stays on the device, e.g. "inventory" — "Your inventory stays on this device." */
  subject: string;
  /** "notes stay" rather than "inventory stays". */
  plural?: boolean;
  email: string | null | undefined;
  connected: boolean;
  connecting: boolean;
  error?: string | null;
  onConnect: () => void;
  syncing?: boolean;
  onSyncFromCloud?: () => void;
  onSyncToCloud?: () => void;
  /** A short result of the last manual sync, shown beside the status. */
  message?: string | null;
  /** Replaces the "Synced" line, for a page that is still loading. */
  connectedMessage?: ReactNode;
  /** Pages whose data syncs live may show nothing once connected. */
  hideWhenConnected?: boolean;
  className?: string;
}) {
  const shell = `flex flex-col gap-2 rounded-xl border border-slate-800/70 bg-slate-900/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${className}`.trim();

  if (!connected) {
    return (
      <div className={shell}>
        <p className="text-sm text-slate-400">
          Your {subject} {plural ? "stay" : "stays"} on this device.{" "}
          <span className="text-slate-300">Sync to save {plural ? "them" : "it"} to your account.</span>
          {error && <span className="block text-xs text-red-400">{error}</span>}
        </p>
        <button
          type="button"
          onClick={onConnect}
          disabled={connecting || !email}
          className="shrink-0 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          {connecting ? "Connecting…" : "Sign in to sync"}
        </button>
      </div>
    );
  }
  if (hideWhenConnected) return null;

  const buttonClass =
    "rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-blue-400 hover:text-blue-300 disabled:opacity-50";
  return (
    <div className={shell}>
      {connectedMessage ?? (
        <p className="text-sm text-slate-400">
          <span className="text-emerald-400">●</span> Synced to your account — changes save automatically.
          {message && <span className="ml-1.5 text-slate-300">{message}</span>}
        </p>
      )}
      {(onSyncFromCloud || onSyncToCloud) && (
        <div className="flex shrink-0 gap-2">
          {onSyncFromCloud && (
            <button type="button" onClick={onSyncFromCloud} disabled={syncing} className={buttonClass}>
              Sync from cloud
            </button>
          )}
          {onSyncToCloud && (
            <button type="button" onClick={onSyncToCloud} disabled={syncing} className={buttonClass}>
              Sync to cloud
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default SyncBanner;
