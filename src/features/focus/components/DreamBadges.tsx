"use client";

import type { JournalNote } from "@/features/focus/lib/types";

// Compact read-only attributes for a dream entry (lucid / nightmare / vividness
// / tags). Tags become buttons when onTagClick is provided.
export function DreamBadges({
  note,
  onTagClick,
}: {
  note: JournalNote;
  onTagClick?: (tag: string) => void;
}) {
  const hasAny =
    note.lucid ||
    note.nightmare ||
    !!note.vividness ||
    (note.tags?.length ?? 0) > 0;
  if (!hasAny) return null;

  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {note.lucid && (
        <span className="rounded bg-indigo-500/15 px-1 text-[10px] font-medium text-indigo-300">
          ✨ Lucid
        </span>
      )}
      {note.nightmare && (
        <span className="rounded bg-red-500/15 px-1 text-[10px] font-medium text-red-300">
          😱 Nightmare
        </span>
      )}
      {note.vividness ? (
        <span
          title={`Vividness ${note.vividness}/5`}
          className="text-[10px] tracking-tight text-amber-300/90"
        >
          {"●".repeat(note.vividness)}
          {"○".repeat(5 - note.vividness)}
        </span>
      ) : null}
      {note.tags?.map((t) =>
        onTagClick ? (
          <button
            key={t}
            type="button"
            onClick={() => onTagClick(t)}
            className="rounded-full border border-slate-700 px-1.5 text-[10px] text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          >
            #{t}
          </button>
        ) : (
          <span
            key={t}
            className="rounded-full border border-slate-700 px-1.5 text-[10px] text-slate-400"
          >
            #{t}
          </span>
        )
      )}
    </span>
  );
}

export default DreamBadges;
