"use client";

import { useState } from "react";

import { Pencil, Trash2 } from "@/components/icons";
import { DreamBadges } from "@/features/focus/components/DreamBadges";
import { MoodIcon } from "@/features/focus/components/MoodIcon";
import { todayKey } from "@/features/focus/data/focusData";
import { MOODS, type MoodKey } from "@/features/focus/lib/mood";
import type {
  DreamDetails,
  JournalNote,
  JournalNoteKind,
} from "@/features/focus/lib/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function dayLabel(key: string): string {
  if (key === todayKey()) return "Today";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${d}`;
}

function timeOf(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  let h = d.getHours();
  const min = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

type DayNotes = { day: string; notes: JournalNote[] };

type JournalCardProps = {
  mood: MoodKey | null;
  moodByDay: Record<string, MoodKey>;
  notesByDay: DayNotes[];
  onAddNote: (
    text: string,
    kind?: JournalNoteKind,
    day?: string,
    details?: DreamDetails
  ) => void;
  onEditNote: (id: string, text: string) => void;
  onRemoveNote: (note: JournalNote) => void;
  onRemoveNotes: (notes: JournalNote[]) => void;
  onMoodChange: (mood: MoodKey | null, day?: string) => void;
  highlight?: boolean;
};

function NoteRow({
  note,
  selectMode,
  selected,
  onToggle,
  onEdit,
  onRemove,
}: {
  note: JournalNote;
  selectMode: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onRemove: (note: JournalNote) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);

  const startEdit = () => {
    setDraft(note.text);
    setEditing(true);
  };
  const commit = () => {
    if (draft.trim()) onEdit(note.id, draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="rounded-lg border border-blue-400/50 bg-slate-950/40 px-3 py-2">
        <textarea
          value={draft}
          autoFocus
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          aria-label="Edit note"
          className="w-full resize-y rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-400 focus:outline-none"
        />
        <div className="mt-2 flex justify-end gap-2 text-xs font-medium">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md px-2.5 py-1 text-slate-400 transition hover:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={commit}
            disabled={!draft.trim()}
            className="rounded-md bg-blue-600 px-2.5 py-1 text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="group flex items-start justify-between gap-3 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2">
      <label className="flex min-w-0 items-start gap-2">
        {selectMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(note.id)}
            aria-label="Select note"
            className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500"
          />
        )}
        <span className="min-w-0">
          {(note.createdAt || note.kind === "dream") && (
            <span className="mb-0.5 flex items-center gap-1.5 text-[11px] tabular-nums text-slate-500">
              {note.kind === "dream" && (
                <span className="rounded bg-indigo-500/15 px-1 text-[10px] font-medium text-indigo-300">
                  🌙 Dream
                </span>
              )}
              {note.createdAt && timeOf(note.createdAt)}
            </span>
          )}
          <span className="block whitespace-pre-wrap break-words text-sm text-slate-200">
            {note.text}
          </span>
          {note.kind === "dream" && <DreamBadges note={note} />}
        </span>
      </label>
      {!selectMode && (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={startEdit}
            aria-label="Edit note"
            className="text-slate-600 opacity-0 transition hover:text-blue-300 focus:opacity-100 group-hover:opacity-100"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(note)}
            aria-label="Delete note"
            className="text-slate-600 opacity-0 transition hover:text-red-300 focus:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </li>
  );
}

export function JournalCard({
  mood,
  moodByDay,
  notesByDay,
  onAddNote,
  onEditNote,
  onRemoveNote,
  onRemoveNotes,
  onMoodChange,
  highlight,
}: JournalCardProps) {
  const today = todayKey();
  const [logDate, setLogDate] = useState(today);
  const backdated = logDate !== today;
  const activeMood = backdated ? moodByDay[logDate] ?? null : mood;
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<JournalNoteKind>("note");
  // Dream-only structured attributes for the entry being composed.
  const [lucid, setLucid] = useState(false);
  const [nightmare, setNightmare] = useState(false);
  const [vividness, setVividness] = useState(0); // 0 = unset
  const [tagsInput, setTagsInput] = useState("");
  const [noteFilter, setNoteFilter] = useState<JournalNoteKind | "all">("all");
  const [justAdded, setJustAdded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const trimmed = draft.trim();
  const canAdd = trimmed.length > 0;
  const isDream = kind === "dream";

  const resetDreamDetails = () => {
    setLucid(false);
    setNightmare(false);
    setVividness(0);
    setTagsInput("");
  };

  const add = () => {
    if (!canAdd) return;
    const details: DreamDetails | undefined = isDream
      ? {
          lucid: lucid || undefined,
          nightmare: nightmare || undefined,
          vividness: vividness || undefined,
          tags: tagsInput
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean),
        }
      : undefined;
    onAddNote(draft, kind, logDate, details);
    setDraft("");
    resetDreamDetails();
    setJustAdded(true);
  };

  const allNotes = notesByDay.flatMap((d) => d.notes);
  const hasNotes = allNotes.length > 0;
  const hasDreams = allNotes.some((n) => n.kind === "dream");
  const matches = (n: JournalNote) =>
    noteFilter === "all" || (n.kind ?? "note") === noteFilter;
  const todayNotes = (
    notesByDay.find((d) => d.day === today)?.notes ?? []
  ).filter(matches);
  const earlier = notesByDay
    .filter((d) => d.day !== today)
    .map((d) => ({ day: d.day, notes: d.notes.filter(matches) }))
    .filter((d) => d.notes.length > 0);
  const earlierCount = earlier.reduce((sum, d) => sum + d.notes.length, 0);

  const toggleNote = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const enterSelect = () => {
    setSelectMode(true);
    setShowHistory(true); // reveal earlier notes so they can be picked
  };
  const exitSelect = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const deleteSelected = () => {
    const notes = allNotes.filter((n) => selectedIds.has(n.id));
    if (notes.length) onRemoveNotes(notes);
    exitSelect();
  };

  const rowProps = (n: JournalNote) => ({
    note: n,
    selectMode,
    selected: selectedIds.has(n.id),
    onToggle: toggleNote,
    onEdit: onEditNote,
    onRemove: onRemoveNote,
  });

  return (
    <section
      className={`rounded-2xl border p-4 shadow-sm transition sm:p-8 ${
        highlight
          ? "border-blue-500/50 bg-blue-950/20"
          : "border-slate-800/70 bg-slate-900/85"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Today’s journal
        </h3>
        {highlight && (
          <span className="text-xs text-blue-300">How did that go?</span>
        )}
      </div>

      {/* Date — defaults to today; pick a past day to backfill mood/notes. */}
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
        <span>For</span>
        <input
          type="date"
          value={logDate}
          max={today}
          onChange={(e) => setLogDate(e.target.value || today)}
          aria-label="Journal date"
          className="rounded-lg border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-100 outline-none focus:border-blue-400"
        />
        {backdated ? (
          <button
            type="button"
            onClick={() => setLogDate(today)}
            className="text-amber-300/90 underline-offset-2 hover:underline"
          >
            backdating · back to today
          </button>
        ) : (
          <span className="text-slate-600">today</span>
        )}
      </div>

      {/* Mood picker */}
      <p className="mb-2 mt-4 text-xs text-slate-500">
        {backdated ? `How did you feel on ${logDate}?` : "How are you feeling?"}
      </p>
      <div className="flex flex-wrap gap-2">
        {MOODS.map((m) => {
          const active = activeMood === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onMoodChange(active ? null : m.key, logDate)}
              aria-pressed={active}
              title={m.label}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-sm transition ${
                active
                  ? "border-blue-400 bg-blue-500/15 text-slate-100"
                  : "border-slate-700 text-slate-300 hover:border-slate-500"
              }`}
            >
              <MoodIcon mood={m.key} className="h-5 w-5" />
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Note vs. dream */}
      <div className="mt-4 inline-flex rounded-full border border-slate-700 p-0.5 text-xs font-medium">
        <button
          type="button"
          aria-pressed={!isDream}
          onClick={() => setKind("note")}
          className={`rounded-full px-3 py-1 transition ${
            !isDream ? "bg-blue-600 text-white" : "text-slate-300 hover:text-slate-100"
          }`}
        >
          📝 Note
        </button>
        <button
          type="button"
          aria-pressed={isDream}
          onClick={() => setKind("dream")}
          className={`rounded-full px-3 py-1 transition ${
            isDream ? "bg-indigo-600 text-white" : "text-slate-300 hover:text-slate-100"
          }`}
        >
          🌙 Dream
        </button>
      </div>

      {/* Add an entry */}
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setJustAdded(false);
        }}
        placeholder={
          isDream
            ? "What did you dream? People, places, how it felt…"
            : "What did you work on? Anything on your mind?"
        }
        rows={3}
        className={`mt-2 w-full resize-y rounded-lg border bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none ${
          isDream
            ? "border-slate-700 focus:border-indigo-400"
            : "border-slate-700 focus:border-blue-400"
        }`}
      />

      {/* Dream attributes — optional, only while composing a dream. */}
      {isDream && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            aria-pressed={lucid}
            onClick={() => setLucid((v) => !v)}
            className={`rounded-full border px-2.5 py-1 font-medium transition ${
              lucid
                ? "border-indigo-400/70 bg-indigo-500/15 text-indigo-200"
                : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
            }`}
          >
            ✨ Lucid
          </button>
          <button
            type="button"
            aria-pressed={nightmare}
            onClick={() => setNightmare((v) => !v)}
            className={`rounded-full border px-2.5 py-1 font-medium transition ${
              nightmare
                ? "border-red-400/70 bg-red-500/15 text-red-200"
                : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
            }`}
          >
            😱 Nightmare
          </button>
          <span className="flex items-center gap-1 text-slate-500">
            <span className="text-[11px]">Vividness</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`Vividness ${n} of 5`}
                aria-pressed={vividness === n}
                onClick={() => setVividness((cur) => (cur === n ? 0 : n))}
                className={`text-sm leading-none transition ${
                  n <= vividness ? "text-amber-300" : "text-slate-600 hover:text-slate-400"
                }`}
              >
                ●
              </button>
            ))}
          </span>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="tags: people, places, themes"
            aria-label="Dream tags (comma-separated)"
            className="min-w-[8rem] flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-2.5 py-1 text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-indigo-400"
          />
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-3">
        <span
          className={`text-xs ${justAdded ? "text-emerald-300" : "text-slate-500"}`}
        >
          {justAdded
            ? "Saved ✓"
            : trimmed.length > 0
              ? `Press Add to save this ${isDream ? "dream" : "note"}`
              : isDream
                ? "Jot it down before it fades"
                : "Add as many notes as you like today"}
        </span>
        <button
          type="button"
          onClick={add}
          disabled={!canAdd}
          className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${
            isDream ? "bg-indigo-600 hover:bg-indigo-500" : "bg-blue-600 hover:bg-blue-500"
          }`}
        >
          {isDream ? "Add dream" : "Add note"}
        </button>
      </div>

      {/* Select / bulk-delete controls */}
      {hasNotes && (
        <div className="mt-4 flex items-center justify-between gap-3 text-xs">
          {selectMode ? (
            <>
              <span className="tabular-nums text-slate-400">
                {selectedIds.size} selected
              </span>
              <div className="flex items-center gap-3 font-medium">
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set(allNotes.map((n) => n.id)))}
                  className="text-slate-400 transition hover:text-slate-200"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={exitSelect}
                  className="text-slate-400 transition hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedIds.size === 0}
                  onClick={deleteSelected}
                  className="rounded-md bg-red-600/90 px-2.5 py-1 text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Delete ({selectedIds.size})
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={enterSelect}
              className="ml-auto rounded-md border border-slate-700 px-2 py-0.5 font-medium text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
            >
              Select
            </button>
          )}
        </div>
      )}

      {/* Filter (only once there are dreams to filter by) */}
      {hasDreams && !selectMode && (
        <div className="mt-4 flex gap-1.5 text-xs">
          {(
            [
              ["all", "All"],
              ["note", "Notes"],
              ["dream", "🌙 Dreams"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={noteFilter === k}
              onClick={() => setNoteFilter(k)}
              className={`rounded-full border px-2.5 py-0.5 font-medium transition ${
                noteFilter === k
                  ? "border-blue-400/70 bg-blue-500/10 text-blue-200"
                  : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Today's notes */}
      {todayNotes.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {todayNotes.map((n) => (
            <NoteRow key={n.id} {...rowProps(n)} />
          ))}
        </ul>
      )}

      {/* Earlier notes */}
      {earlierCount > 0 && (
        <div className="mt-5 border-t border-slate-800/60 pt-4">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-xs font-medium text-slate-500 transition hover:text-slate-300"
          >
            {showHistory ? "▾" : "▸"} Earlier notes ({earlierCount})
          </button>
          {(showHistory || selectMode) && (
            <div className="mt-3 flex flex-col gap-4">
              {earlier.slice(0, 14).map((d) => (
                <div key={d.day}>
                  <p className="mb-2 text-xs font-medium text-slate-400">
                    {dayLabel(d.day)}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {d.notes.map((n) => (
                      <NoteRow key={n.id} {...rowProps(n)} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default JournalCard;
