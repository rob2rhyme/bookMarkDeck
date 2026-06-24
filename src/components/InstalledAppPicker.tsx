"use client";

import { useState } from "react";

import { launcherHealth, launcherListApps, InstalledApp } from "@/utils/launcherClient";

type Props = {
  onPick: (app: InstalledApp) => void;
};

export function InstalledAppPicker({ onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || apps.length > 0 || loading) return;

    setLoading(true);
    setError(null);
    try {
      const healthy = await launcherHealth();
      if (!healthy) {
        setError("Launcher not running — start it on this device to list apps.");
        return;
      }
      const list = await launcherListApps();
      setApps(list);
      if (list.length === 0) {
        setError("No installed apps found (desktop only).");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list installed apps.");
    } finally {
      setLoading(false);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = q ? apps.filter((app) => app.name.toLowerCase().includes(q)) : apps;

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-blue-400 hover:text-white"
      >
        {open ? "Hide installed apps" : "Pick installed app (desktop)"}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950 p-2">
          {loading ? (
            <p className="px-1 py-2 text-xs text-slate-400">Loading installed apps…</p>
          ) : error ? (
            <p className="px-1 py-2 text-xs text-amber-300">{error}</p>
          ) : (
            <>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter apps…"
                aria-label="Filter installed apps"
                className="w-full rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <div className="mt-2 max-h-48 space-y-1 overflow-auto">
                {filtered.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-slate-500">No matches.</p>
                ) : (
                  filtered.map((app) => (
                    <button
                      key={app.localPath ?? app.appUserModelId ?? app.name}
                      type="button"
                      onClick={() => {
                        onPick(app);
                        setOpen(false);
                      }}
                      className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left transition hover:bg-slate-800"
                    >
                      <span className="truncate text-xs font-medium text-slate-100">
                        {app.name}
                      </span>
                      <span className="w-full truncate text-[10px] text-slate-500">
                        {app.bundleId ?? app.appUserModelId ?? app.localPath}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
