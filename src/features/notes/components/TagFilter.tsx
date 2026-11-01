"use client";

import { useState } from "react";

import { tagTone } from "@/features/notes/lib/tagColor";
import { normalizeTag, type TagCount } from "@/features/notes/lib/tags";

const CHIP = "flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition";
const CHIP_ON = "border-blue-400 bg-blue-500/15 text-blue-200";
const CHIP_OFF = "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-slate-100";

/** One scrollable row of tag chips; picking one filters the list. */
export function TagFilter({
  counts,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  counts: TagCount[];
  active: string | null;
  onSelect: (tag: string | null) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (tag: string) => void;
}) {
  if (counts.length === 0) return null;
  const activeCount = counts.find((c) => c.tag === active)?.count ?? 0;
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Filter by tag" className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0 bd-no-scrollbar">
        <button type="button" onClick={() => onSelect(null)} aria-pressed={!active} className={`${CHIP} ${!active ? CHIP_ON : CHIP_OFF}`}>
          All
        </button>
        {counts.map(({ tag, count }) => (
          <button
            key={tag}
            type="button"
            onClick={() => onSelect(active === tag ? null : tag)}
            aria-pressed={active === tag}
            className={`${CHIP} ${active === tag ? tagTone(tag).on : tagTone(tag).soft}`}
          >
            #{tag} <span className="tabular-nums opacity-60">{count}</span>
          </button>
        ))}
      </div>
      {/* Keyed by tag, so switching tags resets any half-finished rename. */}
      {active && activeCount > 0 && (
        <TagManager key={active} tag={active} count={activeCount} onRename={onRename} onDelete={onDelete} />
      )}
    </div>
  );
}

function TagManager({
  tag,
  count,
  onRename,
  onDelete,
}: {
  tag: string;
  count: number;
  onRename: (from: string, to: string) => void;
  onDelete: (tag: string) => void;
}) {
  const [mode, setMode] = useState<"idle" | "rename" | "delete">("idle");
  const [name, setName] = useState(tag);
  const target = normalizeTag(name);
  const notesWord = count === 1 ? "1 note" : `${count} notes`;
  const small = "rounded-full px-3 py-1 text-xs font-semibold transition";

  if (mode === "rename") {
    return (
      <form
        className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800/70 bg-slate-900/80 px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (target && target !== tag) onRename(tag, target);
          setMode("idle");
        }}
      >
        <label htmlFor="tag-rename" className="text-xs text-slate-400">
          Rename #{tag} to
        </label>
        <input
          id="tag-rename"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setMode("idle")}
          autoComplete="off"
          autoCapitalize="none"
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100 focus:border-blue-400 focus:outline-none"
        />
        <button type="submit" disabled={!target || target === tag} className={`${small} bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50`}>
          Rename
        </button>
        <button type="button" onClick={() => setMode("idle")} className={`${small} text-slate-300 hover:bg-slate-800`}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800/70 bg-slate-900/80 px-3 py-2 text-xs">
      {mode === "delete" ? (
        <span role="alert" className="text-slate-200">
          Remove #{tag} from {notesWord}? The notes themselves stay.
        </span>
      ) : (
        <span className="text-slate-400">
          <span className="font-semibold text-slate-200">#{tag}</span> · {notesWord}
        </span>
      )}
      <div className="ml-auto flex gap-1">
        {mode === "delete" ? (
          <>
            <button type="button" onClick={() => setMode("idle")} className={`${small} text-slate-300 hover:bg-slate-800`}>
              Cancel
            </button>
            <button type="button" autoFocus onClick={() => onDelete(tag)} className={`${small} bg-red-600 text-white hover:bg-red-500`}>
              Remove tag
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setMode("rename")} className={`${small} text-slate-300 hover:bg-slate-800`}>
              Rename
            </button>
            <button type="button" onClick={() => setMode("delete")} className={`${small} text-red-300 hover:bg-red-950/40`}>
              Delete tag
            </button>
          </>
        )}
      </div>
    </div>
  );
}
