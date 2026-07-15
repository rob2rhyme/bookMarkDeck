"use client";

import { X } from "@/components/icons";

type StarterRoomsCardProps = {
  rooms: string[]; // the rooms that would be added (missing from the starter set)
  onSeed: () => void;
  onDismiss: () => void;
};

/**
 * First-visit nudge: offer to seed a handful of common rooms so a new My Stuff
 * isn't a blank page. One tap to add them, or dismiss for good.
 */
export function StarterRoomsCard({ rooms, onSeed, onDismiss }: StarterRoomsCardProps) {
  if (rooms.length === 0) return null;
  return (
    <div className="relative rounded-2xl border border-sky-500/25 bg-sky-950/15 p-4 sm:p-5">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200"
      >
        <X className="h-4 w-4" />
      </button>
      <h3 className="text-sm font-semibold text-sky-100">Start with a few rooms?</h3>
      <p className="mt-1 max-w-prose text-sm text-slate-400">
        Give your things a place to live. We can add a handful of common rooms —
        you can rename, nest, or remove any of them later.
      </p>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {rooms.map((r) => (
          <li
            key={r}
            className="rounded-full border border-slate-700 bg-slate-900/60 px-2.5 py-0.5 text-xs text-slate-300"
          >
            {r}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSeed}
          className="rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
        >
          Add these rooms
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 transition hover:text-slate-100"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

export default StarterRoomsCard;
