"use client";

import Link from "next/link";

import { Copy, Pin } from "@/components/icons";
import { Highlight } from "@/features/notes/components/Highlight";
import { editedAgo, type Note } from "@/features/notes/lib/notes";
import type { NoteHit } from "@/features/notes/lib/search";

const MAX_CHIPS = 3;

// The whole card opens the note; Copy, Pin and the tag chips sit above the link
// layer so they work without opening it. The link is stretched with an ::after
// overlay rather than wrapping the card, because a <button> inside an <a> is
// invalid HTML.
export function NoteCard({
  hit,
  now,
  activeTag,
  onCopy,
  onTogglePin,
  onTagClick,
}: {
  hit: NoteHit;
  now: Date;
  activeTag: string | null;
  onCopy: (note: Note) => void;
  onTogglePin: (note: Note) => void;
  onTagClick: (tag: string) => void;
}) {
  const { note, title, preview } = hit;
  const extra = note.tags.length - MAX_CHIPS;
  return (
    <li className="group relative flex min-h-[7rem] flex-col gap-1.5 rounded-2xl border border-slate-800/70 bg-slate-900/70 p-4 shadow-sm transition hover:border-slate-600 focus-within:border-blue-500/60">
      <div className="flex items-start gap-2">
        <Link
          href={`/notes/${note.id}`}
          className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-50 outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-blue-500/80"
        >
          <Highlight {...title} />
        </Link>
        <button
          type="button"
          onClick={() => onTogglePin(note)}
          aria-pressed={note.pinned}
          aria-label={note.pinned ? `Unpin ${title.text}` : `Pin ${title.text}`}
          title={note.pinned ? "Unpin" : "Pin to top"}
          className={`relative z-10 -m-1 rounded-full p-1.5 transition ${
            note.pinned
              ? "text-blue-300 hover:text-blue-200"
              : "text-slate-500 opacity-100 hover:text-slate-200 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          }`}
        >
          <Pin className="h-4 w-4" />
        </button>
      </div>
      <p className={`line-clamp-2 text-sm ${preview.text ? "text-slate-400" : "italic text-slate-500"}`}>
        {preview.text ? <Highlight {...preview} /> : "No additional text"}
      </p>
      {note.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {note.tags.slice(0, MAX_CHIPS).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onTagClick(t)}
              aria-pressed={activeTag === t}
              aria-label={`Show notes tagged ${t}`}
              className={`relative z-10 rounded-full px-2 py-0.5 text-[11px] font-medium transition ${
                activeTag === t
                  ? "bg-blue-500/25 text-blue-200"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
              }`}
            >
              #{t}
            </button>
          ))}
          {extra > 0 && <span className="text-[11px] text-slate-500">+{extra}</span>}
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-slate-500">{editedAgo(note.updatedAt, now)}</span>
        <button
          type="button"
          onClick={() => onCopy(note)}
          aria-label={`Copy ${title.text}`}
          className="relative z-10 flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
        >
          <Copy className="h-3.5 w-3.5" /> Copy
        </button>
      </div>
    </li>
  );
}
