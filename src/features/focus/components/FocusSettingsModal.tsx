"use client";

import { useEffect } from "react";

import { X } from "@/components/icons";
import type { FocusSettings } from "@/features/focus/lib/settings";
import { TOPICS, type TopicId } from "@/features/focus/lib/topics";
import {
  initAudio,
  playChime,
  SOUND_OPTIONS,
  type SoundId,
} from "@/features/focus/lib/sound";

type FocusSettingsModalProps = {
  open: boolean;
  settings: FocusSettings;
  onUpdate: (patch: Partial<FocusSettings>) => void;
  onReset: () => void;
  onExportJson?: () => void;
  onExportCsv?: () => void;
  onClose: () => void;
};

function NumberField({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800/60 py-2.5">
      <label className="text-sm text-slate-200">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
          className="w-16 rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-right text-sm text-slate-100 focus:border-blue-400 focus:outline-none"
        />
        {suffix && (
          <span className="w-9 text-xs text-slate-500">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800/60 py-2.5">
      <label className="text-sm text-slate-200">{label}</label>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-blue-600" : "bg-slate-700"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 mt-5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
      {children}
    </p>
  );
}

export function FocusSettingsModal({
  open,
  settings,
  onUpdate,
  onReset,
  onExportJson,
  onExportCsv,
  onClose,
}: FocusSettingsModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const toggleInterest = (id: TopicId) => {
    const set = new Set(settings.interests);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onUpdate({ interests: [...set] });
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-[5vh]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Focus settings"
        className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-50">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <SectionLabel>Timer durations</SectionLabel>
        <NumberField label="Focus" value={settings.focus} min={1} max={120} suffix="min" onChange={(v) => onUpdate({ focus: v })} />
        <NumberField label="Short break" value={settings.short} min={1} max={60} suffix="min" onChange={(v) => onUpdate({ short: v })} />
        <NumberField label="Long break" value={settings.long} min={1} max={60} suffix="min" onChange={(v) => onUpdate({ long: v })} />
        <NumberField label="Sessions until long break" value={settings.sessionsUntilLong} min={2} max={12} onChange={(v) => onUpdate({ sessionsUntilLong: v })} />

        <SectionLabel>Goal</SectionLabel>
        <NumberField label="Daily focus goal" value={settings.dailyGoalHours} min={1} max={16} suffix="hr" onChange={(v) => onUpdate({ dailyGoalHours: v })} />

        <SectionLabel>Need a push? — interests</SectionLabel>
        <div className="flex flex-wrap gap-1.5 pt-1.5">
          {TOPICS.map((t) => {
            const on = settings.interests.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleInterest(t.id)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  on
                    ? "border-blue-400/70 bg-blue-500/10 text-blue-200"
                    : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                }`}
              >
                {t.emoji} {t.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          Tailors quotes and quizzes. Pick Music, Math or Astronomy for younger
          learners. Leave empty for coding tips &amp; general trivia.
        </p>

        <SectionLabel>Automation</SectionLabel>
        <Toggle label="Auto-start breaks" checked={settings.autoStartBreaks} onChange={(v) => onUpdate({ autoStartBreaks: v })} />
        <Toggle label="Auto-start next focus" checked={settings.autoStartFocus} onChange={(v) => onUpdate({ autoStartFocus: v })} />
        <div className="flex items-center justify-between border-b border-slate-800/60 py-2.5">
          <label className="text-sm text-slate-200">Sound when timer ends</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                initAudio();
                playChime("session", settings.chimeSound);
              }}
              className="text-xs text-blue-300 transition hover:text-blue-200"
            >
              Test
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={settings.soundEnabled}
              aria-label="Sound when timer ends"
              onClick={() => onUpdate({ soundEnabled: !settings.soundEnabled })}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                settings.soundEnabled ? "bg-blue-600" : "bg-slate-700"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                  settings.soundEnabled ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between border-b border-slate-800/60 py-2.5">
          <label className="text-sm text-slate-200">Sound</label>
          <select
            value={settings.chimeSound}
            onChange={(e) => {
              const id = e.target.value as SoundId;
              onUpdate({ chimeSound: id });
              initAudio();
              playChime("session", id);
            }}
            className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-400 focus:outline-none"
          >
            {SOUND_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <SectionLabel>Hydration</SectionLabel>
        <Toggle label="Hydration reminders" checked={settings.hydrationEnabled} onChange={(v) => onUpdate({ hydrationEnabled: v })} />
        <NumberField label="Remind every" value={settings.hydrationIntervalMin} min={5} max={180} suffix="min" onChange={(v) => onUpdate({ hydrationIntervalMin: v })} />
        <NumberField label="Daily goal" value={settings.waterGoal} min={1} max={20} suffix="cups" onChange={(v) => onUpdate({ waterGoal: v })} />

        <SectionLabel>Google sync</SectionLabel>
        <Toggle
          label="Sync with Google (Tasks + Calendar)"
          checked={settings.todoGoogleSync}
          onChange={(v) => onUpdate({ todoGoogleSync: v })}
        />
        <p className="mt-1 text-[11px] text-slate-500">
          Pushes your to-dos to Google Tasks (timed ones also get a Calendar
          event), and shows your Google Calendar agenda + today’s events here.
          Sign out and back in once to grant access.
        </p>

        {(onExportJson || onExportCsv) && (
          <div className="mt-6 border-t border-slate-800/60 pt-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Export your data
            </p>
            <div className="mt-2 flex gap-2">
              {onExportCsv && (
                <button
                  type="button"
                  onClick={onExportCsv}
                  className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
                >
                  Sessions CSV
                </button>
              )}
              {onExportJson && (
                <button
                  type="button"
                  onClick={onExportJson}
                  className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
                >
                  All data JSON
                </button>
              )}
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-slate-500">
          Changes are saved automatically.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onReset}
            className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          >
            Reset to defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            Save &amp; close
          </button>
        </div>
      </div>
    </div>
  );
}

export default FocusSettingsModal;
