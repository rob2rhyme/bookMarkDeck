"use client";

// Reminder preferences and the calendar export (Phase 5).

import { useState } from "react";

import { Modal } from "@/components/Modal";
import { Input, Select } from "@/components/ui/Field";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { buildIcs, filingEvents } from "@/features/filing/lib/ics";
import { pushSupported } from "@/features/filing/lib/push";
import type { FilingDocument, FilingFolder, FilingSettings } from "@/features/filing/lib/types";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

const hourLabel = (h: number) => {
  const suffix = h < 12 ? "am" : "pm";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:00 ${suffix}`;
};

export function FilingSettingsModal({
  open,
  onClose,
  settings,
  onChange,
  documents,
  folders,
  trailFor,
  connected,
}: {
  open: boolean;
  onClose: () => void;
  settings: FilingSettings;
  onChange: (patch: Partial<FilingSettings>) => void;
  documents: FilingDocument[];
  folders: FilingFolder[];
  trailFor: (documentId: string) => string[];
  /** Reminders live in the cloud copy, not the on-device cache — see below. */
  connected: boolean;
}) {
  const [exported, setExported] = useState(0);
  const canPush = pushSupported();

  const events = filingEvents(documents, folders, {
    includeRetention: settings.icsIncludeRetention,
    trailFor,
  });

  function download() {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const blob = new Blob([buildIcs(events, stamp)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bookmark-deck-filing.ics";
    a.click();
    URL.revokeObjectURL(url);
    setExported(events.length);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="filing-settings-title"
      panelClassName="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <h2 id="filing-settings-title" className="text-lg font-semibold tracking-tight text-slate-50">
        Reminders &amp; calendar
      </h2>

      <div className="mt-5 flex flex-col gap-5">
        <div>
          <SectionLabel>Start nudging</SectionLabel>
          <div className="mt-1 flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={365}
              value={settings.leadDays}
              onChange={(e) => onChange({ leadDays: Number(e.target.value) })}
              aria-label="Lead days"
              className="w-24"
            />
            <span className="text-[13px] text-slate-400">days before something is due</span>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={settings.pushEnabled}
              disabled={!canPush}
              onChange={(e) => onChange({ pushEnabled: e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500"
            />
            <span className="min-w-0">
              <span className="text-sm font-medium text-slate-200">Daily summary notification</span>
              <span className="mt-0.5 block text-[12px] text-slate-500">
                {canPush
                  ? "One notification a day listing what needs attention — not one per paper."
                  : "Not available in this browser, or notifications aren’t set up on this deployment."}
              </span>
            </span>
          </label>

          {settings.pushEnabled && canPush && (
            <div className="mt-3 pl-7">
              <SectionLabel>Send it around</SectionLabel>
              <Select
                value={String(settings.pushHour)}
                onChange={(e) => onChange({ pushHour: Number(e.target.value) })}
                aria-label="Notification hour"
                className="mt-1"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </Select>
              <p className="mt-2 text-[12px] text-slate-500">
                Scheduled when you open Filing, up to a day ahead. If you don&rsquo;t open
                the app for a while the summary pauses until you do — the badge and the
                panel here are always current.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-800 pt-4">
          <SectionLabel>Calendar export</SectionLabel>
          <p className="mt-1 text-[13px] text-slate-400">
            Download an <code className="text-slate-300">.ics</code> file and import it into
            Google, Apple or Outlook Calendar. Repeats come across as recurring events.
          </p>

          <label className="mt-3 flex items-start gap-3">
            <input
              type="checkbox"
              checked={settings.icsIncludeRetention}
              onChange={(e) => onChange({ icsIncludeRetention: e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500"
            />
            <span className="text-[13px] text-slate-300">
              Include clear-out dates as well as renewals
            </span>
          </label>

          {!connected && (
            // The on-device cache keeps only what the list, badge and queues
            // need (ANALYSIS-FILING-LOG.md §7); obligations come back from the
            // cloud copy. Without saying so, an unsynced export looks complete
            // while quietly missing every renewal.
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-300/90">
              You&rsquo;re not synced, so renewals and payments aren&rsquo;t loaded on this
              device — only clear-out dates will export. Sign in to include everything.
            </p>
          )}

          <button
            type="button"
            onClick={download}
            disabled={events.length === 0}
            className="mt-3 rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:opacity-40"
          >
            {events.length === 0
              ? "Nothing dated to export yet"
              : `Download ${events.length} date${events.length === 1 ? "" : "s"}`}
          </button>

          {exported > 0 && (
            <p className="mt-2 text-[12px] text-emerald-400">
              Exported {exported} date{exported === 1 ? "" : "s"}. Re-export after changes —
              this is a file, not a live feed.
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-6 w-full rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
      >
        Done
      </button>
    </Modal>
  );
}
