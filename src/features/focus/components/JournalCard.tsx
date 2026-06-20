"use client";

import { MOODS, type MoodKey } from "@/features/focus/lib/mood";

type JournalCardProps = {
  note: string;
  mood: MoodKey | null;
  onNoteChange: (note: string) => void;
  onMoodChange: (mood: MoodKey | null) => void;
  highlight?: boolean;
};

export function JournalCard({
  note,
  mood,
  onNoteChange,
  onMoodChange,
  highlight,
}: JournalCardProps) {
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
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder="What did you work on? Anything on your mind?"
        rows={4}
        className="mt-4 w-full resize-y rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
      />
    </section>
  );
}

export default JournalCard;
