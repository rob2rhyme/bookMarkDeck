"use client";

import { useState } from "react";

import { Trash2 } from "@/components/icons";
import { MoodIcon } from "@/features/focus/components/MoodIcon";
import { todayKey } from "@/features/focus/data/focusData";
import { MOODS, type MoodKey } from "@/features/focus/lib/mood";
import type { JournalNote } from "@/features/focus/lib/types";

const MAX_NOTE = 2000;

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
  notesByDay: DayNotes[];
  onAddNote: (text: string) => void;
  onRemoveNote: (note: JournalNote) => void;
  onMoodChange: (mood: MoodKey | null) => void;
  highlight?: boolean;
};

function NoteRow({
  note,
  onRemove,
}: {
  note: JournalNote;
  onRemove: (note: JournalNote) => void;
}) {
  return (
    <li className="group flex items-start justify-between gap-3 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2">
      <div className="min-w-0">
        {note.createdAt && (
          <span className="mb-0.5 block text-[11px] tabular-nums text-slate-500">
            {timeOf(note.createdAt)}
          </span>
        )}
        <p className="whitespace-pre-wrap break-words text-sm text-slate-200">
          {note.text}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onRemove(note)}
        aria-label="Delete note"
        className="shrink-0 text-slate-600 opacity-0 transition hover:text-red-300 focus:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

export function JournalCard({
  mood,
  notesByDay,
  onAddNote,
  onRemoveNote,
  onMoodChange,
  highlight,
}: JournalCardProps) {
  const [draft, setDraft] = useState("");
  const [justAdded, setJustAdded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const trimmed = draft.trim();
  const tooLong = draft.length > MAX_NOTE;
  const canAdd = trimmed.length > 0 && !tooLong;

  const add = () => {
    if (!canAdd) return;
    onAddNote(draft);
    setDraft("");
    setJustAdded(true);
  };

  const today = todayKey();
  const todayNotes = notesByDay.find((d) => d.day === today)?.notes ?? [];
  const earlier = notesByDay.filter((d) => d.day !== today);
  const earlierCount = earlier.reduce((sum, d) => sum + d.notes.length, 0);

  return (
    <section
      className={`rounded-2xl border p-6 shadow-sm transition sm:p-8 ${
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

      {/* Mood picker */}
      <p className="mb-2 mt-4 text-xs text-slate-500">How are you feeling?</p>
      <div className="flex flex-wrap gap-2">
        {MOODS.map((m) => {
          const active = mood === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onMoodChange(active ? null : m.key)}
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

      {/* Add a note */}
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setJustAdded(false);
        }}
        placeholder="What did you work on? Anything on your mind?"
        rows={3}
        maxLength={MAX_NOTE + 200}
        className={`mt-4 w-full resize-y rounded-lg border bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none ${
          tooLong
            ? "border-red-500/70 focus:border-red-400"
            : "border-slate-700 focus:border-blue-400"
        }`}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span
          className={`text-xs ${
            tooLong
              ? "text-red-400"
              : justAdded
                ? "text-emerald-300"
                : "text-slate-500"
          }`}
        >
          {tooLong
            ? `${draft.length} / ${MAX_NOTE} — too long`
            : justAdded
              ? "Added ✓"
              : trimmed.length > 0
                ? "Press Add to save this note"
                : "Add as many notes as you like today"}
        </span>
        <button
          type="button"
          onClick={add}
          disabled={!canAdd}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add note
        </button>
      </div>

      {/* Today's notes */}
      {todayNotes.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {todayNotes.map((n) => (
            <NoteRow key={n.id} note={n} onRemove={onRemoveNote} />
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
          {showHistory && (
            <div className="mt-3 flex flex-col gap-4">
              {earlier.slice(0, 14).map((d) => (
                <div key={d.day}>
                  <p className="mb-2 text-xs font-medium text-slate-400">
                    {dayLabel(d.day)}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {d.notes.map((n) => (
                      <NoteRow key={n.id} note={n} onRemove={onRemoveNote} />
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
