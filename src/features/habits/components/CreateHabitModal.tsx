"use client";

import { useEffect, useState } from "react";

import { TimeInput } from "@/components/DateTimeField";
import { Modal } from "@/components/Modal";
import { Emoji } from "@/components/icons";
import {
  AREA_ICON_CHOICES,
  DEFAULT_AREA_ICON,
  suggestAreaIcon,
} from "@/features/habits/lib/areas";
import { WEEKDAY_LABELS } from "@/features/habits/lib/day";
import { SECTION_LABEL_CLASS } from "@/components/ui/SectionLabel";
import {
  DEFAULT_HABIT_EMOJI,
  EMOJI_CHOICES,
  HUE_CHOICES,
  hueColor,
  suggestEmoji,
} from "@/features/habits/lib/format";
import {
  LINK_OPT_OUT,
  resolveSource,
  suggestSource,
} from "@/features/habits/lib/trackableSources";
import type {
  Habit,
  HabitDirection,
  HabitSchedule,
  HabitType,
} from "@/features/habits/lib/types";

type CreateHabitModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (habit: Habit) => void;
  onDelete?: (id: string) => void;
  initial?: Habit | null;
  /** Whether `initial` is an existing habit (edit) vs a fresh draft (create). */
  isEdit?: boolean;
  nextSortOrder: number;
  /** Existing area names, offered as quick-pick suggestions. */
  existingAreas?: string[];
  /** Existing area → icon, to prefill the icon when reusing an area name. */
  areaIcons?: Map<string, string>;
  /**
   * Whether a reminder can actually be delivered. Injected rather than read
   * here: this component would otherwise have to import the push client from
   * another feature. Defaults to true so the hint reads as it always did when
   * a caller doesn't pass it.
   */
  canRemind?: boolean;
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
  existingAreas = [],
  areaIcons,
  canRemind = true,
}: CreateHabitModalProps) {
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [areaIcon, setAreaIcon] = useState(DEFAULT_AREA_ICON);
  const [emoji, setEmoji] = useState(DEFAULT_HABIT_EMOJI);
  // Once the user hand-picks an icon we stop auto-suggesting from the name.
  const [emojiTouched, setEmojiTouched] = useState(false);
  const [hue, setHue] = useState(200);
  const [direction, setDirection] = useState<HabitDirection>("build");
  const [type, setType] = useState<HabitType>("binary");
  const [unit, setUnit] = useState("");
  const [target, setTarget] = useState(8);
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<SchedKind>("daily");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [perWeek, setPerWeek] = useState(3);
  const [identity, setIdentity] = useState("");
  const [reminder, setReminder] = useState("");
  const [linkedSourceId, setLinkedSourceId] = useState<string | null>(null);

  // Reset the form whenever the modal (re)opens.
  useEffect(() => {
    if (!open) return;
    setEmojiTouched(true); // editing or reopening: don't clobber existing choice
    if (initial) {
      setName(initial.name);
      setEmoji(initial.emoji);
      setHue(initial.hue);
      setDirection(initial.direction ?? "build");
      setType(initial.type);
      setUnit(initial.unit ?? "");
      setTarget(initial.target ?? 8);
      setStep(initial.step ?? 1);
      setIdentity(initial.identity ?? "");
      setArea(initial.area ?? "");
      setAreaIcon(initial.areaIcon?.trim() || DEFAULT_AREA_ICON);
      setReminder(initial.reminder ?? "");
      setLinkedSourceId(initial.linkedSourceId ?? null);
      setKind(initial.schedule.type);
      if (initial.schedule.type === "weekdays") setDays(initial.schedule.days);
      if (initial.schedule.type === "timesPerWeek") setPerWeek(initial.schedule.count);
    } else {
      setName("");
      setEmoji(DEFAULT_HABIT_EMOJI);
      setEmojiTouched(false); // fresh draft: let the name drive the icon

      setHue(200);
      setDirection("build");
      setType("binary");
      setUnit("");
      setTarget(8);
      setStep(1);
      setIdentity("");
      setArea("");
      setAreaIcon(DEFAULT_AREA_ICON);
      setReminder("");
      setKind("daily");
      setDays([1, 2, 3, 4, 5]);
      setPerWeek(3);
      setLinkedSourceId(null);
    }
  }, [open, initial]);

  const onNameChange = (value: string) => {
    setName(value);
    if (!emojiTouched) setEmoji(suggestEmoji(value) || DEFAULT_HABIT_EMOJI);
  };

  const pickEmoji = (e: string) => {
    setEmoji(e);
    setEmojiTouched(true);
  };

  const onAreaChange = (value: string) => {
    setArea(value);
    // Reuse an existing area's icon; else auto-suggest from the name while the
    // icon is still the default (so a manual pick is never overwritten).
    const known = areaIcons?.get(value.trim());
    if (known) setAreaIcon(known);
    else if (areaIcon === DEFAULT_AREA_ICON)
      setAreaIcon(suggestAreaIcon(value) || DEFAULT_AREA_ICON);
  };

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
      direction,
      unit: type === "measurable" ? unit.trim() || "x" : undefined,
      target: type === "measurable" ? Math.max(1, Math.round(target)) : undefined,
      step: type === "measurable" ? Math.max(1, Math.round(step)) : undefined,
      schedule,
      identity: identity.trim() || undefined,
      area: area.trim() || undefined,
      areaIcon: area.trim() ? areaIcon : undefined,
      reminder: /^\d{1,2}:\d{2}$/.test(reminder) ? reminder : null,
      linkedSourceId: linkedSourceId ?? undefined,
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

  // Live Focus-sync preview from the in-progress fields (type/unit/name drive
  // the match). `linkedSource` = what's active; `candidate` = what it could link
  // to even if currently opted out (powers the re-Link affordance).
  const draftForLink: Habit = {
    id: initial?.id ?? "draft",
    name: name.trim(),
    emoji,
    hue,
    type,
    unit: type === "measurable" ? unit.trim() || "x" : undefined,
    identity: identity.trim() || undefined,
    linkedSourceId,
    schedule: { type: "daily" },
    archived: false,
    sortOrder: 0,
    createdAt: null,
  };
  const linkedSource = resolveSource(draftForLink);
  const candidate = suggestSource(draftForLink);

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

      {/* Name + live auto-icon */}
      <label className={`mt-4 block ${SECTION_LABEL_CLASS}`}>
        Name
      </label>
      <div className="mt-1 flex items-center gap-2">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-950/60 text-lg"
          aria-hidden="true"
          title="Icon (change under Add details)"
        >
          <Emoji>{emoji}</Emoji>
        </span>
        <input
          type="text"
          value={name}
          autoFocus
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="e.g. Meditate"
          className="w-full flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
        />
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">
        Tiny and doable wins. New habits default to a daily yes/no — fine-tune
        anything under “Add details”.
      </p>

      {/* Area / category — a primary field so habits get grouped from the start. */}
      <label className={`mt-4 block ${SECTION_LABEL_CLASS}`}>
        Area (optional)
      </label>
      <div className="mt-1 flex items-center gap-2">
        {area.trim() && (
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-950/60 text-lg"
            aria-hidden="true"
          >
            <Emoji>{areaIcon}</Emoji>
          </span>
        )}
        <input
          type="text"
          value={area}
          onChange={(e) => onAreaChange(e.target.value)}
          list="habit-area-suggestions"
          placeholder="e.g. Health, Work, Learning"
          className="w-full flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400"
        />
      </div>
      {existingAreas.length > 0 && (
        <datalist id="habit-area-suggestions">
          {existingAreas.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
      )}
      {area.trim() && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {AREA_ICON_CHOICES.map((ic) => (
            <button
              key={ic}
              type="button"
              onClick={() => setAreaIcon(ic)}
              aria-pressed={areaIcon === ic}
              className={`flex h-7 w-7 items-center justify-center rounded-lg border text-base transition ${
                areaIcon === ic
                  ? "border-blue-400 bg-blue-500/10"
                  : "border-slate-800 hover:border-slate-600"
              }`}
            >
              <Emoji>{ic}</Emoji>
            </button>
          ))}
        </div>
      )}
      <p className="mt-1 text-[11px] text-slate-500">
        Group related habits under a category to filter them later.
      </p>

      {/* Everything else, tucked away for beginners; opens automatically when
          editing an existing habit so power users see all fields. */}
      <details open={isEdit} className="group mt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-600">
          <span>Add details</span>
          <span className="text-xs text-slate-500">
            <span className="group-open:hidden">Show ▾</span>
            <span className="hidden group-open:inline">Hide ▴</span>
          </span>
        </summary>

        <div className="mt-3">
          {/* Identity */}
          <label className={`block ${SECTION_LABEL_CLASS}`}>
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
          <p className={`mt-4 mb-1 ${SECTION_LABEL_CLASS}`}>Icon</p>
          <div className="flex flex-wrap gap-1.5">
            {EMOJI_CHOICES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => pickEmoji(e)}
                aria-pressed={emoji === e}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border text-lg transition ${
                  emoji === e ? "border-blue-400 bg-blue-500/10" : "border-slate-800 hover:border-slate-600"
                }`}
              >
                <Emoji>{e}</Emoji>
              </button>
            ))}
          </div>

          {/* Colour */}
          <p className={`mt-4 mb-1 ${SECTION_LABEL_CLASS}`}>Colour</p>
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

          {/* Direction — build it up, or quit / cut it down */}
          <p className={`mt-4 mb-1 ${SECTION_LABEL_CLASS}`}>Goal</p>
          <div className="flex gap-2">
            <button type="button" className={seg(direction === "build")} onClick={() => setDirection("build")}>
              🌱 Build
            </button>
            <button type="button" className={seg(direction === "quit")} onClick={() => setDirection("quit")}>
              🚫 Quit / reduce
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {direction === "build"
              ? "Build it up — a streak counts the days you did it."
              : "Quit or cut down — a streak counts the days you stayed clean / under your limit."}
          </p>

          {/* Type */}
          <p className={`mt-4 mb-1 ${SECTION_LABEL_CLASS}`}>Type</p>
          <div className="flex gap-2">
            <button type="button" className={seg(type === "binary")} onClick={() => setType("binary")}>
              Yes / no
            </button>
            <button type="button" className={seg(type === "measurable")} onClick={() => setType("measurable")}>
              Measurable
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {type === "binary"
              ? "Yes / no — one tap: did it or not."
              : "Measurable — track an amount like cups or minutes toward a target."}
          </p>
          {type === "measurable" && (
            <>
              <div className="mt-2 flex gap-2">
                <label className="flex-1 text-xs text-slate-400">
                  {direction === "quit" ? "Daily limit" : "Target"}
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
              <p className="mt-1 text-[11px] text-slate-500">
                Step = how much each − / + button adds.
              </p>
            </>
          )}

          {/* Schedule */}
          <p className={`mt-4 mb-1 ${SECTION_LABEL_CLASS}`}>Schedule</p>
          <div className="flex gap-2">
            <button type="button" className={seg(kind === "daily")} onClick={() => setKind("daily")}>
              Every day
            </button>
            <button type="button" className={seg(kind === "weekdays")} onClick={() => setKind("weekdays")}>
              Specific days
            </button>
            <button type="button" className={seg(kind === "timesPerWeek")} onClick={() => setKind("timesPerWeek")}>
              Times a week
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
                  aria-label={label}
                  className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition ${
                    days.includes(d)
                      ? "border-blue-400/70 bg-blue-500/10 text-blue-200"
                      : "border-slate-800 text-slate-400 hover:border-slate-600"
                  }`}
                >
                  {label.slice(0, 2)}
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
              <span className="w-24 shrink-0 text-sm text-slate-300 tabular-nums">
                {perWeek}× a week
              </span>
            </div>
          )}

          {/* Focus sync — auto-complete this habit from Focus activity */}
          {(linkedSource || candidate) && (
            <>
              <p className={`mt-4 mb-1 ${SECTION_LABEL_CLASS}`}>
                Focus sync
              </p>
              {linkedSource ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-400/40 bg-blue-500/5 px-3 py-2">
                  <span className="min-w-0 text-sm text-slate-200">
                    🔗 Auto-completes from{" "}
                    <span className="font-medium text-blue-200">
                      {linkedSource.label}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setLinkedSourceId(LINK_OPT_OUT)}
                    className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
                  >
                    Unlink
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <span className="min-w-0 text-sm text-slate-400">
                    Not syncing — {candidate?.label} available
                  </span>
                  <button
                    type="button"
                    onClick={() => candidate && setLinkedSourceId(candidate.id)}
                    className="shrink-0 rounded-lg border border-blue-400/60 px-3 py-1.5 text-xs text-blue-200 transition hover:bg-blue-500/10"
                  >
                    Link
                  </button>
                </div>
              )}
              <p className="mt-1 text-[11px] text-slate-500">
                {linkedSource
                  ? "Fills in automatically from your Focus activity."
                  : "Mark this done automatically when you log it in Focus."}
              </p>
            </>
          )}

          {/* Reminder */}
          <p className={`mt-4 mb-1 ${SECTION_LABEL_CLASS}`}>
            Reminder (optional)
          </p>
          <div className="flex items-center gap-2">
            <TimeInput
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
              {canRemind
                ? "A gentle push at this time on scheduled days."
                : "Notifications aren’t set up on this deployment, so this time won’t send a push yet."}
            </span>
          </div>
        </div>
      </details>

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
