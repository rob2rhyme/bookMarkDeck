"use client";

import Link from "next/link";

import { Copy, Pin } from "@/components/icons";
import { cardText, editedAgo, type Note } from "@/features/notes/lib/notes";

// The whole card opens the note; Copy and Pin sit above the link layer so they
// work without opening it. The link is stretched with an ::after overlay rather
// than wrapping the card, because a <button> inside an <a> is invalid HTML.
export function NoteCard({
  note,
  now,
  onCopy,
  onTogglePin,
}: {
  note: Note;
  now: Date;
  onCopy: (note: Note) => void;
  onTogglePin: (note: Note) => void;
}) {
  const { title, preview } = cardText(note);
  return (
    <li className="group relative flex min-h-[7rem] flex-col gap-1.5 rounded-2xl border border-slate-800/70 bg-slate-900/70 p-4 shadow-sm transition hover:border-slate-600 focus-within:border-blue-500/60">
      <div className="flex items-start gap-2">
        <Link
          href={`/notes/${note.id}`}
          className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-50 outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-blue-500/80"
        >
          {title}
        </Link>
        <button
          type="button"
          onClick={() => onTogglePin(note)}
          aria-pressed={note.pinned}
          aria-label={note.pinned ? `Unpin ${title}` : `Pin ${title}`}
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
      <p className={`line-clamp-2 text-sm ${preview ? "text-slate-400" : "italic text-slate-500"}`}>
        {preview || "No additional text"}
      </p>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-slate-500">{editedAgo(note.updatedAt, now)}</span>
        <button
          type="button"
          onClick={() => onCopy(note)}
          aria-label={`Copy ${title}`}
          className="relative z-10 flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-blue-400 hover:text-blue-300"
        >
          <Copy className="h-3.5 w-3.5" /> Copy
        </button>
      </div>
    </li>
  );
}
