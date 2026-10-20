"use client";

import { useId, useRef, useState } from "react";

import { X } from "@/components/icons";
import { MAX_TAGS_PER_NOTE, normalizeTag, suggestTags, type TagCount } from "@/features/notes/lib/tags";

/**
 * A note's tags: chips plus an input that suggests tags already in use.
 * Enter or "," adds; Backspace on an empty input removes the last tag; ↑/↓ pick
 * a suggestion. A combobox, so screen readers hear the suggestions.
 */
export function TagEditor({
  tags,
  counts,
  onChange,
}: {
  tags: string[];
  counts: TagCount[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  // Esc clears the draft AND blurs; blur runs with this render's draft, so
  // without the flag it would add the very tag Esc just abandoned.
  const cancelled = useRef(false);
  const full = tags.length >= MAX_TAGS_PER_NOTE;
  const suggestions = open && !full ? suggestTags(counts, draft, tags) : [];
  const typed = normalizeTag(draft);

  const add = (raw: string) => {
    const t = normalizeTag(raw);
    setDraft("");
    setActive(-1);
    if (!t || tags.includes(t) || full) return;
    onChange([...tags, t]);
  };
  const remove = (t: string) => onChange(tags.filter((x) => x !== t));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (active >= 0 && suggestions[active]) add(suggestions[active]);
      else if (typed) add(draft);
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      e.preventDefault();
      remove(tags[tags.length - 1]);
    } else if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      // Handled here, so the editor's Esc-to-leave doesn't fire.
      e.preventDefault();
      cancelled.current = true;
      setDraft("");
      setActive(-1);
      e.currentTarget.blur();
    }
  };

  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span key={t} className="flex items-center gap-0.5 rounded-full bg-slate-800 py-0.5 pl-2 pr-1 text-xs font-medium text-slate-200">
          #{t}
          <button
            type="button"
            onClick={() => remove(t)}
            aria-label={`Remove tag ${t}`}
            className="rounded-full p-0.5 text-slate-400 transition hover:bg-slate-700 hover:text-slate-100"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => {
          // A pasted or typed comma commits what came before it.
          const v = e.target.value;
          if (v.includes(",")) {
            const parts = v.split(",");
            const rest = parts.pop() ?? "";
            const added = parts.map(normalizeTag).filter((t): t is string => !!t && !tags.includes(t));
            if (added.length) onChange([...tags, ...new Set(added)].slice(0, MAX_TAGS_PER_NOTE));
            setDraft(rest);
          } else {
            setDraft(v);
          }
          setActive(-1);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          if (cancelled.current) cancelled.current = false;
          else if (typed) add(draft); // leaving the field keeps what was typed
        }}
        disabled={full}
        placeholder={full ? "Tag limit reached" : tags.length ? "Add tag" : "Add tags"}
        aria-label="Add tag"
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="done"
        className="min-w-[6rem] flex-1 bg-transparent py-0.5 text-slate-300 placeholder:text-slate-600 focus:outline-none"
      />
      {suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Tag suggestions"
          className="absolute left-0 top-full z-20 mt-1 flex max-w-full flex-wrap gap-1 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-lg"
        >
          {suggestions.map((t, i) => (
            <li
              key={t}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: keep focus in the input so blur doesn't fire first.
              onMouseDown={(e) => {
                e.preventDefault();
                add(t);
              }}
              className={`cursor-pointer rounded-full px-2 py-0.5 text-xs font-medium transition ${
                i === active ? "bg-blue-500/25 text-blue-200" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              #{t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
