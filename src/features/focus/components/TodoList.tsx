"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Check, CheckSquare, Pencil, Search, Trash2, X } from "@/components/icons";
import { BulletButton, NumberButton } from "@/components/BulletButton";
import { HighlightedText } from "@/components/HighlightedText";
import { NoteText } from "@/components/NoteText";
import {
  appendBullet,
  appendNumber,
  type ChecklistItem,
  continueListOnEnter,
  noteChecklistItems,
  setNoteItemChecked,
  toChecklistBlocks,
} from "@/utils/noteFormat";
import { DueField } from "@/features/focus/components/DueField";
import { todayKey } from "@/features/focus/data/focusData";
import type { AgendaEvent } from "@/features/focus/hooks/useGoogleEvents";
import { filterTodos } from "@/features/focus/lib/todoSearch";
import type { Todo, TodoList as TodoListKey } from "@/features/focus/lib/types";

type TodoListProps = {
  active: Todo[];
  done: Todo[];
  todayEvents?: AgendaEvent[]; // read-only Google Calendar events for today
  projectSuggestions?: string[]; // reusable project names (existing + tasks)
  onAdd: (
    text: string,
    dueAt: string | null,
    note: string,
    list: TodoListKey,
    project: string
  ) => void;
  onToggle: (todo: Todo) => void;
  onEdit: (
    id: string,
    patch: { text?: string; note?: string; dueAt?: string | null; project?: string }
  ) => void;
  onRemove: (todo: Todo) => void;
};

type Tone = "overdue" | "soon" | "normal";

function remaining(dueAt: string, now: number): { text: string; tone: Tone } {
  const ms = new Date(dueAt).getTime() - now;
  const overdue = ms < 0;
  const a = Math.abs(ms);
  const d = Math.floor(a / 86400000);
  const h = Math.floor((a % 86400000) / 3600000);
  const m = Math.floor((a % 3600000) / 60000);
  const s = Math.floor((a % 60000) / 1000);
  let str: string;
  if (d > 0) str = `${d}d ${h}h`;
  else if (h > 0) str = `${h}h ${m}m`;
  else if (m > 0) str = `${m}m ${s}s`;
  else str = `${s}s`;
  if (overdue) return { text: `Overdue ${str}`, tone: "overdue" };
  return { text: `${str} left`, tone: a < 3600000 ? "soon" : "normal" };
}

/** A note textbox that both auto-grows to fit its content as the user types and
 *  stays drag-resizable (the bottom-right handle), matching the Journal note.
 *  In list mode (caret on a bullet/numbered line) Enter starts the next item;
 *  Enter on an empty item ends the list. */
function NoteTextarea({
  value,
  onValueChange,
  ...rest
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Grow to fit content, but never shrink below whatever the user dragged to.
    const dragged = el.dataset.dragged === "1" ? el.offsetHeight : 0;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, dragged)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
        const el = e.currentTarget;
        // With text selected, default Enter (replace selection) is correct.
        if (el.selectionStart !== el.selectionEnd) return;
        const next = continueListOnEnter(
          el.value,
          el.selectionStart ?? el.value.length
        );
        if (!next) return; // not on a list line → default newline
        e.preventDefault();
        onValueChange(next.text);
        requestAnimationFrame(() => el.setSelectionRange(next.caret, next.caret));
      }}
      onMouseUp={(e) => {
        // Remember a manual drag-resize so auto-grow won't undo it.
        e.currentTarget.dataset.dragged = "1";
      }}
      rows={3}
      className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
      {...rest}
    />
  );
}

const TONE_CLASS: Record<Tone, string> = {
  overdue: "text-red-300",
  soon: "text-amber-300",
  normal: "text-sky-300",
};

function dueTitle(dueAt: string): string {
  return new Date(dueAt).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DueBadge({ todo, now }: { todo: Todo; now: number }) {
  if (!todo.dueAt) {
    return <span className="text-xs text-slate-500">No due date</span>;
  }
  const { text, tone } = remaining(todo.dueAt, now);
  return (
    <span
      title={dueTitle(todo.dueAt)}
      className={`text-xs font-medium tabular-nums ${TONE_CLASS[tone]}`}
    >
      {text}
    </span>
  );
}

/** One mini-list row — the same circle-toggle in both states, filled when done. */
function ChecklistRow({
  item,
  onToggle,
}: {
  item: ChecklistItem;
  onToggle: (line: number, checked: boolean) => void;
}) {
  return (
    <li className="flex items-start gap-2">
      <button
        type="button"
        onClick={() => onToggle(item.line, !item.checked)}
        aria-label={`Mark “${item.text}” ${item.checked ? "not done" : "done"}`}
        title={item.checked ? "Undo — mark not done" : undefined}
        className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition ${
          item.checked
            ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
            : "border-slate-600 hover:border-emerald-400"
        }`}
      >
        {item.checked && <Check className="h-2.5 w-2.5" />}
      </button>
      <NoteText
        text={item.text}
        className={`min-w-0 flex-1 break-words ${
          item.checked ? "text-slate-500 line-through" : ""
        }`}
      />
    </li>
  );
}

/** A to-do's note with its list lines as a checkable mini-list. Checked items
 *  leave the list and land in a "Completed" fold inside the same box; the
 *  parent to-do only moves to Done once every mini item is checked. Notes
 *  without list lines fall back to the plain NoteText display. */
function ChecklistNote({
  note,
  onToggleItem,
}: {
  note: string;
  onToggleItem: (line: number, checked: boolean) => void;
}) {
  // Parse once per note change — TodoList re-renders every second while a
  // due-date countdown runs, and the note only changes on edit.
  const blocks = useMemo(() => toChecklistBlocks(note), [note]);
  const completed = blocks.flatMap((b) =>
    b.type === "items" ? b.items.filter((it) => it.checked) : []
  );

  if (!blocks.some((b) => b.type === "items")) {
    return (
      <NoteText
        text={note}
        className="mt-0.5 block whitespace-pre-wrap break-words text-xs text-slate-400"
      />
    );
  }

  return (
    <div className="mt-0.5 text-xs text-slate-400">
      {blocks.map((b, i) => {
        if (b.type === "text") {
          return b.text.trim() ? (
            <NoteText
              key={i}
              text={b.text}
              className="block whitespace-pre-wrap break-words"
            />
          ) : null;
        }
        const open = b.items.filter((it) => !it.checked);
        if (open.length === 0) return null;
        return (
          <ul key={i} className="flex flex-col gap-1 py-0.5">
            {open.map((it) => (
              <ChecklistRow key={it.line} item={it} onToggle={onToggleItem} />
            ))}
          </ul>
        );
      })}
      {completed.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer list-none text-[11px] font-medium text-emerald-300/80 transition hover:text-emerald-200">
            ✓ Completed ({completed.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-1">
            {completed.map((it) => (
              <ChecklistRow key={it.line} item={it} onToggle={onToggleItem} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function TodoList({
  active,
  done,
  todayEvents = [],
  projectSuggestions = [],
  onAdd,
  onToggle,
  onEdit,
  onRemove,
}: TodoListProps) {
  const [list, setList] = useState<TodoListKey>("personal");
  const [draft, setDraft] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftDue, setDraftDue] = useState<string | null>(null);
  const [draftProject, setDraftProject] = useState("");
  const [search, setSearch] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // The two lists live in one card; the tab picks which one is shown/added to.
  const listOf = (t: Todo): TodoListKey => t.list ?? "personal";
  const activeInList = useMemo(
    () => active.filter((t) => listOf(t) === list),
    [active, list]
  );
  const doneInList = useMemo(
    () => done.filter((t) => listOf(t) === list),
    [done, list]
  );
  const personalCount = useMemo(
    () => active.filter((t) => listOf(t) === "personal").length,
    [active]
  );
  const projectCount = useMemo(
    () => active.filter((t) => listOf(t) === "project").length,
    [active]
  );

  // Inline edit state.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editDue, setEditDue] = useState<string | null>(null);
  const [editProject, setEditProject] = useState("");

  const hasDue = activeInList.some((t) => t.dueAt);
  useEffect(() => {
    if (!hasDue) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasDue]);

  const sortedActive = useMemo(
    () =>
      [...activeInList].sort((a, b) => {
        if (a.dueAt && b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
        if (a.dueAt) return -1;
        if (b.dueAt) return 1;
        return 0;
      }),
    [activeInList]
  );

  // Quick search filters whichever list (Personal/Project) is showing, matching
  // the to-do text, note, and project name. Tab counts stay unfiltered totals.
  const query = search.trim();
  const filteredActive = useMemo(
    () => filterTodos(sortedActive, query),
    [sortedActive, query]
  );
  const filteredDone = useMemo(
    () => filterTodos(doneInList, query),
    [doneInList, query]
  );
  // A live query reveals matching Done items even when the fold is collapsed.
  const doneOpen = showDone || query.length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onAdd(draft, draftDue, draftNote, list, draftProject);
    setDraft("");
    setDraftNote("");
    setDraftDue(null);
    // Keep the project name — most project to-dos are added in batches.
  };

  // Check/uncheck one mini-list item inside a to-do's note. When the last open
  // item gets checked, the whole to-do moves to Done. onToggle gets the
  // *updated* todo so downstream mirrors (Google) see the new note, not a
  // stale one.
  const toggleNoteItem = (todo: Todo, line: number, checked: boolean) => {
    if (listOf(todo) !== "project") return; // Project-only feature
    const nextNote = setNoteItemChecked(todo.note, line, checked);
    if (nextNote === todo.note) return;
    onEdit(todo.id, { note: nextNote });
    if (checked && !todo.done) {
      const items = noteChecklistItems(nextNote);
      if (items.length > 0 && items.every((it) => it.checked)) {
        onToggle({ ...todo, note: nextNote });
      }
    }
  };

  const startEdit = (todo: Todo) => {
    setEditingId(todo.id);
    setEditText(todo.text);
    setEditNote(todo.note ?? "");
    setEditDue(todo.dueAt);
    setEditProject(todo.project ?? "");
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = () => {
    if (!editText.trim()) return;
    onEdit(editingId!, {
      text: editText,
      note: editNote.trim(),
      dueAt: editDue,
      project: editProject.trim(),
    });
    setEditingId(null);
  };

  const today = todayKey();

  return (
    <div className="flex flex-col rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-950/50 via-slate-900/90 to-indigo-950/40 p-4 shadow-lg shadow-blue-950/40 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-blue-200">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-500/15 text-blue-300">
            <CheckSquare className="h-4 w-4" />
          </span>
          To-do list
        </h3>
        <span className="text-xs text-slate-400">
          {list === "project"
            ? "Project-only · stays off Google Calendar"
            : "Unfinished items roll over"}
        </span>
      </div>

      {/* List tabs: Personal (syncs to Google when enabled) vs Project (private). */}
      <div className="mt-3 inline-flex rounded-lg border border-slate-700 bg-slate-950/50 p-0.5 text-xs font-medium">
        {(
          [
            { key: "personal", label: "Personal", count: personalCount },
            { key: "project", label: "Project", count: projectCount },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setList(t.key)}
            aria-pressed={list === t.key}
            className={`rounded-md px-3 py-1.5 transition ${
              list === t.key
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span
                className={`ml-1.5 tabular-nums ${
                  list === t.key ? "text-blue-100" : "text-slate-500"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Add */}
      <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
        {list === "project" && (
          <>
            <input
              type="text"
              list="todo-project-names"
              value={draftProject}
              onChange={(e) => setDraftProject(e.target.value)}
              placeholder="Project name — type or pick a saved one"
              aria-label="Project name"
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
            />
            <datalist id="todo-project-names">
              {projectSuggestions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={list === "project" ? "Add a project fix" : "Add a to-do"}
            aria-label="Add a to-do"
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
          >
            Add
          </button>
        </div>
        <NoteTextarea
          value={draftNote}
          onValueChange={setDraftNote}
          placeholder="Add a note or link (optional)"
          aria-label="To-do note"
        />
        <div className="flex gap-2">
          <BulletButton onInsert={() => setDraftNote((n) => appendBullet(n))} />
          <NumberButton onInsert={() => setDraftNote((n) => appendNumber(n))} />
        </div>
        <DueField value={draftDue} onChange={setDraftDue} />
      </form>

      {list === "personal" && todayEvents.length > 0 && (
        <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-950/20 px-3 py-2.5">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-violet-300/80">
            📅 On your calendar today
          </p>
          <ul className="flex flex-col gap-1">
            {todayEvents.map((e) => (
              <li key={`${e.calendarId}-${e.id}`}>
                <a
                  href={e.htmlLink ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-baseline gap-3 text-sm text-slate-200 transition hover:text-violet-200"
                >
                  <span className="w-16 shrink-0 text-xs tabular-nums text-violet-300/90">
                    {e.allDay || !e.start
                      ? "All day"
                      : new Date(e.start).toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                  </span>
                  <span className="min-w-0 truncate">{e.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeInList.length + doneInList.length > 0 && (
        <div className="relative mt-4">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
            <Search className="h-4 w-4" />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              list === "project" ? "Search project fixes" : "Search to-dos"
            }
            aria-label="Search to-dos"
            className="w-full rounded-lg border border-slate-700 bg-slate-950/60 py-2 pl-9 pr-9 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute inset-y-0 right-2 flex items-center text-slate-500 transition hover:text-slate-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {sortedActive.length === 0 ? (
          <li className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-400">
            {list === "project"
              ? "No project fixes. Add one — it stays private, off your Google Calendar."
              : "Nothing to do. Add a to-do — give it a due date for a live countdown."}
          </li>
        ) : filteredActive.length === 0 ? (
          <li className="rounded-lg border border-dashed border-slate-700/70 bg-slate-950/30 px-3 py-6 text-center text-sm text-slate-400">
            No to-dos match “{query}”.
          </li>
        ) : (
          filteredActive.map((todo) => {
            if (editingId === todo.id) {
              return (
                <li
                  key={todo.id}
                  className="flex flex-col gap-2 rounded-lg border border-blue-500/50 bg-slate-950/40 px-3 py-2"
                >
                  {list === "project" && (
                    <input
                      type="text"
                      list="todo-project-names"
                      value={editProject}
                      onChange={(e) => setEditProject(e.target.value)}
                      placeholder="Project name"
                      aria-label="Project name"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
                    />
                  )}
                  <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    aria-label="Edit to-do"
                    autoFocus
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-blue-400 focus:outline-none"
                  />
                  <NoteTextarea
                    value={editNote}
                    onValueChange={setEditNote}
                    placeholder="Add a note (optional)"
                    aria-label="To-do note"
                  />
                  <div className="flex gap-2">
                    <BulletButton
                      onInsert={() => setEditNote((n) => appendBullet(n))}
                    />
                    <NumberButton
                      onInsert={() => setEditNote((n) => appendNumber(n))}
                    />
                  </div>
                  <DueField value={editDue} onChange={setEditDue} />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-500"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-500"
                    >
                      Save
                    </button>
                  </div>
                </li>
              );
            }
            const rolledOver = todo.day && todo.day < today;
            return (
              <li
                key={todo.id}
                className="group flex items-center gap-3 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => onToggle(todo)}
                  aria-label="Mark done"
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-600 transition hover:border-emerald-400"
                />
                <div className="min-w-0 flex-1">
                  <NoteText
                    text={todo.text}
                    highlight={query}
                    className="block truncate text-sm text-slate-100"
                  />
                  {/* Checkable mini-lists are Project-only (app-private, never
                      mirrored to Google) — Personal notes stay plain display. */}
                  {todo.note &&
                    (listOf(todo) === "project" ? (
                      <ChecklistNote
                        note={todo.note}
                        onToggleItem={(line, checked) =>
                          toggleNoteItem(todo, line, checked)
                        }
                      />
                    ) : (
                      <NoteText
                        text={todo.note}
                        className="mt-0.5 block whitespace-pre-wrap break-words text-xs text-slate-400"
                      />
                    ))}
                  <span className="flex flex-wrap items-center gap-2">
                    {todo.project && (
                      <span className="max-w-full truncate rounded-full bg-blue-500/15 px-1.5 text-[10px] font-medium text-blue-200">
                        📁 <HighlightedText text={todo.project} query={query} />
                      </span>
                    )}
                    <DueBadge todo={todo} now={now} />
                    {rolledOver && (
                      <span className="rounded-full bg-slate-800 px-1.5 text-[10px] font-medium text-slate-400">
                        rolled over
                      </span>
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(todo)}
                  aria-label="Edit to-do"
                  className="shrink-0 text-slate-600 opacity-100 transition sm:opacity-0 hover:text-blue-300 focus:opacity-100 sm:group-hover:opacity-100"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(todo)}
                  aria-label="Delete to-do"
                  className="shrink-0 text-slate-600 opacity-100 transition sm:opacity-0 hover:text-red-300 focus:opacity-100 sm:group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })
        )}
      </ul>

      {filteredDone.length > 0 && (
        <div className="mt-4">
          {/* While searching, the fold is locked open to surface matches, so the
              header is static text — not a toggle that would look inert and
              quietly flip showDone under the query. */}
          {query ? (
            <span className="text-xs font-medium text-slate-500">
              Done ({filteredDone.length})
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              className="text-xs font-medium text-slate-500 transition hover:text-slate-300"
            >
              {showDone ? "▾" : "▸"} Done ({filteredDone.length})
            </button>
          )}
          {doneOpen && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {filteredDone.map((todo) => (
                <li
                  key={todo.id}
                  className="group flex items-center gap-3 rounded-lg px-3 py-1.5"
                >
                  <button
                    type="button"
                    onClick={() => onToggle(todo)}
                    aria-label="Mark not done"
                    title="Undo — mark not done"
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-emerald-500 bg-emerald-500/20 text-emerald-300 transition hover:bg-emerald-500/30"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <NoteText
                    text={todo.text}
                    highlight={query}
                    className="min-w-0 flex-1 truncate text-sm text-slate-500 line-through"
                  />
                  <button
                    type="button"
                    onClick={() => onToggle(todo)}
                    className="shrink-0 text-[11px] font-medium text-slate-500 opacity-100 transition sm:opacity-0 hover:text-slate-200 focus:opacity-100 sm:group-hover:opacity-100"
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(todo)}
                    aria-label="Delete to-do"
                    className="shrink-0 text-slate-600 opacity-100 transition sm:opacity-0 hover:text-red-300 focus:opacity-100 sm:group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default TodoList;
