"use client";

import { Modal } from "@/components/Modal";
import { useEffect, useRef } from "react";

import { X } from "@/components/icons";
import type { FocusSettings } from "@/features/focus/lib/settings";
import { SECTION_LABEL_CLASS } from "@/components/ui/SectionLabel";
import {
  TOPICS,
  type QuizDifficulty,
  type TopicId,
} from "@/features/focus/lib/topics";

const QUIZ_DIFFICULTIES: { id: QuizDifficulty; label: string; hint: string }[] = [
  { id: "all", label: "All levels", hint: "Easy → Hard" },
  { id: "medium", label: "Challenging", hint: "Medium & Hard" },
  { id: "hard", label: "Expert", hint: "Hard only" },
];
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
  onImportJson?: (file: File) => void;
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
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-800/60 py-2.5">
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
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-800/60 py-2.5">
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
    <p className={`mb-1 mt-5 ${SECTION_LABEL_CLASS}`}>
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
  onImportJson,
  onClose,
}: FocusSettingsModalProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
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
    // Interests and Bible mode are mutually exclusive — choosing an interest
    // turns Bible mode off.
    onUpdate({ interests: [...set], bibleMode: false });
  };

  return (
    <Modal
      open
      onClose={onClose}
      label="Focus settings"
      overlayClassName="inset-0 flex items-start justify-center overflow-y-auto px-4 py-[5vh]"
      panelClassName="animate-bd-scale-in w-full max-w-md overflow-x-hidden rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl outline-none"
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
        {TOPICS.filter((t) => t.id !== "bible").map((t) => {
          const on = settings.interests.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              disabled={settings.bibleMode}
              title={
                settings.bibleMode
                  ? "Turn off Bible mode to choose interests"
                  : undefined
              }
              onClick={() => toggleInterest(t.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                settings.bibleMode
                  ? "cursor-not-allowed border-slate-800 text-slate-600 opacity-50"
                  : on
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
        {settings.bibleMode
          ? "Interests are paused while Bible mode is on — turn it off below to choose topics."
          : "Tailors quotes and quizzes. Pick Music, Math or Astronomy for younger learners. Leave empty for coding tips & general trivia."}
      </p>

      <div className="mt-3">
        <Toggle
          label="✝️ Bible mode"
          checked={settings.bibleMode}
          onChange={(v) => onUpdate({ bibleMode: v })}
        />
        <p className="mt-1.5 text-[11px] text-slate-500">
          {settings.bibleMode
            ? "Showing Scripture verses & Bible quizzes — your interests above are paused while this is on."
            : "Switches “Need a push?” to encouraging Bible verses and Bible-trivia quizzes."}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-800/60 py-2.5">
        <label className="text-sm text-slate-200">Quiz difficulty</label>
        <div
          role="group"
          aria-label="Quiz difficulty"
          className="flex flex-wrap gap-1.5"
        >
          {QUIZ_DIFFICULTIES.map((d) => {
            const on = settings.quizDifficulty === d.id;
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={on}
                title={d.hint}
                onClick={() => onUpdate({ quizDifficulty: d.id })}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  on
                    ? "border-blue-400/70 bg-blue-500/10 text-blue-200"
                    : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">
        Raise this if quizzes feel too easy — “Challenging” and “Expert” drop
        the easy questions.
      </p>

      <SectionLabel>Automation</SectionLabel>
      <Toggle label="Auto-start breaks" checked={settings.autoStartBreaks} onChange={(v) => onUpdate({ autoStartBreaks: v })} />
      <Toggle label="Auto-start next focus" checked={settings.autoStartFocus} onChange={(v) => onUpdate({ autoStartFocus: v })} />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-800/60 py-2.5">
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
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-800/60 py-2.5">
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

      <SectionLabel>Meditation</SectionLabel>
      <Toggle label="Show meditation card" checked={settings.meditationEnabled} onChange={(v) => onUpdate({ meditationEnabled: v })} />
      <NumberField label="Default length" value={settings.meditationMinutes} min={1} max={60} suffix="min" onChange={(v) => onUpdate({ meditationMinutes: v })} />

      <SectionLabel>Let them — reset</SectionLabel>
      <Toggle label="Show “Let them” reset card" checked={settings.letThemEnabled} onChange={(v) => onUpdate({ letThemEnabled: v })} />
      <p className="mt-1.5 text-[11px] text-slate-500">
        A 60-second cognitive reframe next to Meditation — release what you
        can&apos;t control, then refocus on what you can.
      </p>

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

      {(onExportJson || onExportCsv || onImportJson) && (
        <div className="mt-6 border-t border-slate-800/60 pt-4">
          <p className={SECTION_LABEL_CLASS}>
            Your data
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
                Export JSON
              </button>
            )}
            {onImportJson && (
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
              >
                Import JSON
              </button>
            )}
          </div>
          {onImportJson && (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onImportJson(file);
                }}
                className="hidden"
              />
              <p className="mt-2 text-[11px] text-slate-500">
                Import restores a JSON backup into your account (merges by id —
                nothing is overwritten or duplicated).
              </p>
            </>
          )}
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
    </Modal>
  );
}

export default FocusSettingsModal;
