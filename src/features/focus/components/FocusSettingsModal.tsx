"use client";

import { useEffect } from "react";

import { X } from "@/components/icons";
import type { FocusSettings } from "@/features/focus/lib/settings";
import { initAudio, playChime } from "@/features/focus/lib/sound";

type FocusSettingsModalProps = {
  open: boolean;
  settings: FocusSettings;
  onUpdate: (patch: Partial<FocusSettings>) => void;
  onReset: () => void;
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
          <span className="w-7 text-xs text-slate-500">{suffix}</span>
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
                playChime("session");
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

        <SectionLabel>Hydration</SectionLabel>
        <Toggle label="Hydration reminders" checked={settings.hydrationEnabled} onChange={(v) => onUpdate({ hydrationEnabled: v })} />
        <NumberField label="Remind every" value={settings.hydrationIntervalMin} min={5} max={180} suffix="min" onChange={(v) => onUpdate({ hydrationIntervalMin: v })} />
        <NumberField label="Daily goal" value={settings.waterGoal} min={1} max={20} suffix="🥛" onChange={(v) => onUpdate({ waterGoal: v })} />

        <button
          type="button"
          onClick={onReset}
          className="mt-6 w-full rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

export default FocusSettingsModal;
