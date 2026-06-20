"use client";

import { useEffect, useRef, useState } from "react";

import { MOOD_BY_KEY, MOODS, type MoodKey } from "@/features/focus/lib/mood";
import type { JournalEntry } from "@/features/focus/lib/types";

const MAX_NOTE = 2000;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${d}`;
}

type JournalCardProps = {
  note: string;
  mood: MoodKey | null;
  history: JournalEntry[];
  onSaveNote: (note: string) => void;
  onMoodChange: (mood: MoodKey | null) => void;
  highlight?: boolean;
};

export function JournalCard({
  note,
  mood,
  history,
  onSaveNote,
  onMoodChange,
  highlight,
}: JournalCardProps) {
  const [draft, setDraft] = useState(note);
  const [showHistory, setShowHistory] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const lastSyncedRef = useRef(note);

  // Reset the editor only on an external note change (day rollover, cloud pull)
  // — not from our own save, which intentionally clears the field.
  useEffect(() => {
    if (note !== lastSyncedRef.current) {
      lastSyncedRef.current = note;
      setDraft(note);
      setJustSaved(false);
    }
  }, [note]);

  const trimmed = draft.trim();
  const tooLong = draft.length > MAX_NOTE;
  const dirty = draft !== note;
  const canSave = dirty && trimmed.length > 0 && !tooLong;

  const save = () => {
    if (!canSave) return;
    onSaveNote(draft);
    lastSyncedRef.current = draft;
    setDraft("");
    setJustSaved(true);
  };

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
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
                active
                  ? "border-blue-400 bg-blue-500/15 text-slate-100"
                  : "border-slate-700 text-slate-300 hover:border-slate-500"
              }`}
            >
              <span className="text-base leading-none">{m.emoji}</span>
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Note */}
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setJustSaved(false);
        }}
        placeholder="What did you work on? Anything on your mind?"
        rows={4}
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
              : justSaved
                ? "text-emerald-300"
                : "text-slate-500"
          }`}
        >
          {tooLong
            ? `${draft.length} / ${MAX_NOTE} — too long`
            : justSaved
              ? "Saved ✓"
              : dirty
                ? trimmed.length === 0
                  ? "Add a note to save"
                  : "Unsaved changes"
                : note.trim().length > 0
                  ? "Saved"
                  : ""}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save
        </button>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="mt-5 border-t border-slate-800/60 pt-4">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-xs font-medium text-slate-500 transition hover:text-slate-300"
          >
            {showHistory ? "▾" : "▸"} Saved notes ({history.length})
          </button>
          {showHistory && (
            <ul className="mt-3 flex flex-col gap-3">
              {history.slice(0, 14).map((e) => (
                <li
                  key={e.day}
                  className="rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2"
                >
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-xs font-medium text-slate-400">
                      {dayLabel(e.day)}
                    </span>
                    {e.mood && (
                      <span title={MOOD_BY_KEY[e.mood].label}>
                        {MOOD_BY_KEY[e.mood].emoji}
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-300">
                    {e.note}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export default JournalCard;
