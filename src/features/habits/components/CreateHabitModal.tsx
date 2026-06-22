"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/Modal";
import { WEEKDAY_LABELS } from "@/features/habits/lib/day";
import { EMOJI_CHOICES, HUE_CHOICES, hueColor } from "@/features/habits/lib/format";
import type { Habit, HabitSchedule, HabitType } from "@/features/habits/lib/types";

type CreateHabitModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (habit: Habit) => void;
  onDelete?: (id: string) => void;
  initial?: Habit | null;
  /** Whether `initial` is an existing habit (edit) vs a fresh draft (create). */
  isEdit?: boolean;
  nextSortOrder: number;
};

type SchedKind = "daily" | "weekdays" | "timesPerWeek";

export function CreateHabitModal({
  open,
  onClose,
  onSave,
  onDelete,
  initial,
  isEdit = Boolean(initial),
  nextSortOrder,
}: CreateHabitModalProps) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("✅");
  const [hue, setHue] = useState(200);
  const [type, setType] = useState<HabitType>("binary");
  const [unit, setUnit] = useState("");
  const [target, setTarget] = useState(8);
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<SchedKind>("daily");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [perWeek, setPerWeek] = useState(3);
  const [identity, setIdentity] = useState("");
  const [reminder, setReminder] = useState("");

  // Reset the form whenever the modal (re)opens.
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name);
      setEmoji(initial.emoji);
      setHue(initial.hue);
      setType(initial.type);
      setUnit(initial.unit ?? "");
      setTarget(initial.target ?? 8);
      setStep(initial.step ?? 1);
      setIdentity(initial.identity ?? "");
      setReminder(initial.reminder ?? "");
      setKind(initial.schedule.type);
      if (initial.schedule.type === "weekdays") setDays(initial.schedule.days);
      if (initial.schedule.type === "timesPerWeek") setPerWeek(initial.schedule.count);
    } else {
      setName("");
      setEmoji("✅");
      setHue(200);
      setType("binary");
      setUnit("");
      setTarget(8);
      setStep(1);
      setIdentity("");
      setReminder("");
      setKind("daily");
      setDays([1, 2, 3, 4, 5]);
      setPerWeek(3);
    }
  }, [open, initial]);

  const toggleDay = (d: number) =>
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
    );

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    let schedule: HabitSchedule = { type: "daily" };
    if (kind === "weekdays") schedule = { type: "weekdays", days: days.length ? days : [1, 2, 3, 4, 5] };
    if (kind === "timesPerWeek") schedule = { type: "timesPerWeek", count: Math.min(7, Math.max(1, perWeek)) };

    const habit: Habit = {
      id: initial?.id ?? crypto.randomUUID(),
      name: trimmed,
      emoji,
      hue,
      type,
      unit: type === "measurable" ? unit.trim() || "x" : undefined,
      target: type === "measurable" ? Math.max(1, Math.round(target)) : undefined,
      step: type === "measurable" ? Math.max(1, Math.round(step)) : undefined,
      schedule,
      identity: identity.trim() || undefined,
      reminder: /^\d{1,2}:\d{2}$/.test(reminder) ? reminder : null,
      archived: initial?.archived ?? false,
      sortOrder: initial?.sortOrder ?? nextSortOrder,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    };
    onSave(habit);
    onClose();
  };

  const seg = (active: boolean) =>
    `flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
      active
        ? "border-blue-400/70 bg-blue-500/10 text-blue-200"
        : "border-slate-700 text-slate-300 hover:border-slate-500"
    }`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="habit-form-title"
      panelClassName="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl outline-none"
    >
      <h2 id="habit-form-title" className="text-lg font-semibold tracking-tight text-slate-50">
        {isEdit ? "Edit habit" : "New habit"}
      </h2>

      {/* Name */}
      <label className="mt-4 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Name
      </label>
      <input
        type="text"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="e.g. Meditate"
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
      />

      {/* Identity */}
      <label className="mt-4 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Identity (optional)
      </label>
      <div className="mt-1 flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2">
        <span className="shrink-0 text-sm text-slate-500">Become someone who</span>
        <input
          type="text"
          value={identity}
          onChange={(e) => setIdentity(e.target.value)}
          placeholder="stays calm"
          className="w-full bg-transparent text-sm text-slate-100 outline-none"
        />
      </div>

      {/* Emoji */}
      <p className="mt-4 mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Icon</p>
      <div className="flex flex-wrap gap-1.5">
        {EMOJI_CHOICES.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEmoji(e)}
            aria-pressed={emoji === e}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border text-lg transition ${
              emoji === e ? "border-blue-400 bg-blue-500/10" : "border-slate-800 hover:border-slate-600"
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      {/* Colour */}
      <p className="mt-4 mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Colour</p>
      <div className="flex flex-wrap gap-2">
        {HUE_CHOICES.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => setHue(h)}
            aria-pressed={hue === h}
            aria-label={`Colour ${h}`}
            className={`h-7 w-7 rounded-full border-2 transition ${
              hue === h ? "border-white" : "border-transparent"
            }`}
            style={{ background: hueColor(h, "ring") }}
          />
        ))}
      </div>

      {/* Type */}
      <p className="mt-4 mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Type</p>
      <div className="flex gap-2">
        <button type="button" className={seg(type === "binary")} onClick={() => setType("binary")}>
          Yes / no
        </button>
        <button type="button" className={seg(type === "measurable")} onClick={() => setType("measurable")}>
          Measurable
        </button>
      </div>
      {type === "measurable" && (
        <div className="mt-2 flex gap-2">
          <label className="flex-1 text-xs text-slate-400">
            Target
            <input
              type="number"
              min={1}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-400"
            />
          </label>
          <label className="flex-1 text-xs text-slate-400">
            Unit
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="cups"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-400"
            />
          </label>
          <label className="w-20 text-xs text-slate-400">
            Step
            <input
              type="number"
              min={1}
              value={step}
              onChange={(e) => setStep(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-400"
            />
          </label>
        </div>
      )}

      {/* Schedule */}
      <p className="mt-4 mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Schedule</p>
      <div className="flex gap-2">
        <button type="button" className={seg(kind === "daily")} onClick={() => setKind("daily")}>
          Every day
        </button>
        <button type="button" className={seg(kind === "weekdays")} onClick={() => setKind("weekdays")}>
          Specific days
        </button>
        <button type="button" className={seg(kind === "timesPerWeek")} onClick={() => setKind("timesPerWeek")}>
          × / week
        </button>
      </div>
      {kind === "weekdays" && (
        <div className="mt-2 flex gap-1">
          {WEEKDAY_LABELS.map((label, d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              aria-pressed={days.includes(d)}
              className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition ${
                days.includes(d)
                  ? "border-blue-400/70 bg-blue-500/10 text-blue-200"
                  : "border-slate-800 text-slate-400 hover:border-slate-600"
              }`}
            >
              {label[0]}
            </button>
          ))}
        </div>
      )}
      {kind === "timesPerWeek" && (
        <div className="mt-2 flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={7}
            value={perWeek}
            onChange={(e) => setPerWeek(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
          <span className="w-20 shrink-0 text-sm text-slate-300 tabular-nums">{perWeek}× / week</span>
        </div>
      )}

      {/* Reminder */}
      <p className="mt-4 mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Reminder (optional)
      </p>
      <div className="flex items-center gap-2">
        <input
          type="time"
          value={reminder}
          onChange={(e) => setReminder(e.target.value)}
          aria-label="Reminder time"
          className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
        />
        {reminder && (
          <button
            type="button"
            onClick={() => setReminder("")}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
          >
            Off
          </button>
        )}
        <span className="text-[11px] text-slate-500">
          A gentle push at this time on scheduled days.
        </span>
      </div>

      {/* Actions */}
      <div className="mt-6 flex gap-2">
        {isEdit && initial && onDelete && (
          <button
            type="button"
            onClick={() => {
              onDelete(initial.id);
              onClose();
            }}
            className="rounded-lg border border-red-900/60 px-3 py-2 text-sm text-red-300 transition hover:bg-red-950/40"
          >
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!name.trim()}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          {isEdit ? "Save" : "Add habit"}
        </button>
      </div>
    </Modal>
  );
}

export default CreateHabitModal;
