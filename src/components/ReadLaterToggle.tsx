"use client";

import type { Bookmark } from "@/types/bookmark";
import { dequeuePatch, isQueued, isRead, queuePatch, readPatch, waitingLabel } from "@/utils/readLater";

/**
 * The read-later state of one bookmark as a slim row: add it to the queue, mark it
 * read, or queue it again. Where it sits (a card, the reader dialog) is up to the
 * caller; the state itself is two timestamps on the bookmark.
 */
export function ReadLaterToggle({
  bookmark,
  onChange,
  className = "",
}: {
  bookmark: Pick<Bookmark, "readLaterAt" | "readAt">;
  onChange: (patch: Pick<Bookmark, "readLaterAt" | "readAt">) => void;
  className?: string;
}) {
  const link = "text-blue-300 underline-offset-2 hover:underline";
  const queued = isQueued(bookmark);
  const read = isRead(bookmark);
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 ${className}`.trim()}>
      {queued ? (
        <>
          <span>
            <span aria-hidden>📖 </span>In your queue
            {bookmark.readLaterAt ? ` · ${waitingLabel(bookmark.readLaterAt)}` : ""}
          </span>
          <button type="button" className={link} onClick={() => onChange(readPatch())}>
            Mark read
          </button>
          <button type="button" className="text-slate-500 underline-offset-2 hover:underline" onClick={() => onChange(dequeuePatch())}>
            Remove
          </button>
        </>
      ) : read ? (
        <>
          <span>
            <span aria-hidden>✓ </span>Read
          </span>
          <button type="button" className={link} onClick={() => onChange(queuePatch())}>
            Queue again
          </button>
        </>
      ) : (
        <button type="button" className={link} onClick={() => onChange(queuePatch())}>
          <span aria-hidden>＋ </span>Read later
        </button>
      )}
    </div>
  );
}

export default ReadLaterToggle;
