"use client";

// The note editor: title + auto-growing body, debounced autosave, and
// plain-text list smarts (lib/smartText.ts). Phase 1 — no markdown rendering.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { ArrowLeft, CheckSquare, Copy, ExternalLink, Pin, Share2, Trash2 } from "@/components/icons";
import { IconAction } from "@/components/IconAction";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/toast/ToastProvider";
import { Markdown } from "@/features/notes/components/Markdown";
import { TagEditor } from "@/features/notes/components/TagEditor";
import { useAutosave, type SaveStatus } from "@/features/notes/hooks/useAutosave";
import { useNotes } from "@/features/notes/hooks/useNotes";
import { useNotesSync } from "@/features/notes/hooks/useNotesSync";
import { copyText } from "@/features/notes/lib/clipboard";
import { parseMarkdown, toggleTaskLine } from "@/features/notes/lib/markdown";
import { tagCounts } from "@/features/notes/lib/tags";
import { countWords, editedAgo, isBlank, MAX_NOTE_CHARS, type Note } from "@/features/notes/lib/notes";
import {
  continueList,
  cycleHeading,
  indentLines,
  insertLink,
  tabIndents,
  toggleBullets,
  toggleChecklist,
  toggleLinePrefix,
  wrapInline,
  type TextEdit,
} from "@/features/notes/lib/smartText";

export function NoteEditorScreen({ id }: { id: string }) {
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? null;
  const sync = useNotesSync(email);
  const api = useNotes(email, sync.connected);
  const note = api.notes.find((n) => n.id === id) ?? null;
  // Set by a delete: the note vanishes a beat before the route changes, and
  // "doesn't exist" shouldn't flash in between.
  const [leaving, setLeaving] = useState(false);

  const back = (
    <Link
      href="/notes"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 transition hover:text-blue-300"
    >
      <ArrowLeft className="h-4 w-4" /> All notes
    </Link>
  );

  // Until the first snapshot lands, a note opened from another device may simply
  // not have arrived yet — "not found" would be a lie.
  const waiting = status === "loading" || !api.hydrated || (!note && sync.connected && !api.cloudLoaded);
  if (leaving) return null;
  if (waiting) {
    return (
      <div className="flex flex-col gap-4 px-3 sm:px-0">
        {back}
        <p className="text-sm text-slate-500" role="status">
          Loading note…
        </p>
      </div>
    );
  }
  if (!note) {
    return (
      <div className="flex flex-col gap-4 px-3 sm:px-0">
        {back}
        <EmptyState>This note doesn&rsquo;t exist — it may have been deleted.</EmptyState>
      </div>
    );
  }
  // No sync banner here: the list carries it, and the save status below the
  // editor already says "Saved on this device" when sync is off.
  return (
    <NoteEditor key={note.id} note={note} api={api} canSync={api.canSync} onLeave={() => setLeaving(true)} />
  );
}

// Edit or Preview, remembered per device (like the theme). A device-local
// convenience, so no sync; a blank note always opens in Edit.
type View = "edit" | "preview";
const VIEW_KEY = "bd:notes:view:v1";
const readView = (): View => {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "preview" ? "preview" : "edit";
  } catch {
    return "edit";
  }
};

type Format = (value: string, start: number, end: number) => TextEdit | null;
// The toolbar, in order. Phones have no ⌘B, so every format is one tap.
const FORMATS: { label: string; glyph: React.ReactNode; keys?: string; run: Format }[] = [
  { label: "Bold", glyph: <span className="font-bold">B</span>, keys: "⌘B", run: (v, s, e) => wrapInline(v, s, e, "**") },
  { label: "Italic", glyph: <span className="font-serif italic">I</span>, keys: "⌘I", run: (v, s, e) => wrapInline(v, s, e, "*") },
  { label: "Strikethrough", glyph: <span className="line-through">S</span>, keys: "⌘⇧X", run: (v, s, e) => wrapInline(v, s, e, "~~") },
  { label: "Heading", glyph: <span className="font-semibold">H</span>, run: cycleHeading },
  { label: "Bulleted list", glyph: <span className="text-lg leading-none">•</span>, run: toggleBullets },
  { label: "Checklist", glyph: <CheckSquare className="h-4 w-4" />, keys: "⌘↵", run: toggleChecklist },
  { label: "Quote", glyph: <span className="font-serif text-lg leading-none">&rdquo;</span>, run: (v, s, e) => toggleLinePrefix(v, s, e, "> ") },
  { label: "Code", glyph: <span className="font-mono text-xs">{"</>"}</span>, run: (v, s, e) => wrapInline(v, s, e, "`") },
  { label: "Link", glyph: <ExternalLink className="h-4 w-4" />, run: insertLink },
];

// A note left blank is discarded when the editor closes — "New note" then Back
// leaves nothing behind. Deferred one tick and cancelled by a remount of the
// same note, so React's dev-mode double mount can't delete the note being opened.
const pendingDiscard = new Map<string, ReturnType<typeof setTimeout>>();

function statusText(status: SaveStatus, canSync: boolean, updatedAt: string, now: Date): string {
  switch (status) {
    case "pending":
    case "saving":
      return "Saving…";
    case "saved":
      return canSync ? "Saved" : "Saved on this device";
    case "error":
      return "Couldn't save";
    default:
      return `Edited ${editedAgo(updatedAt, now)}`;
  }
}

function NoteEditor({
  note,
  api,
  canSync,
  onLeave,
}: {
  note: Note;
  api: ReturnType<typeof useNotes>;
  canSync: boolean;
  onLeave: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { updateNote, removeNote, restoreNote } = api;

  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [confirming, setConfirming] = useState(false);
  const [now] = useState(() => new Date());
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // A brand-new note opens with the cursor in the title.
  const [openedBlank] = useState(() => isBlank(note));
  // This component only renders after the notes cache has loaded (post-mount),
  // so reading localStorage here never runs during SSR.
  const [view, setViewState] = useState<View>(() => (openedBlank ? "edit" : readView()));
  const setView = (v: View) => {
    setViewState(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode — the choice just isn't remembered */
    }
  };

  // The latest draft, for the debounced save and the unmount checks, which run
  // after this render has committed.
  const draft = useRef({ title, body });
  useEffect(() => {
    draft.current = { title, body };
  });

  const autosave = useAutosave(() => updateNote(note.id, draft.current));
  const { schedule, flush, saveNow, dirty } = autosave;

  // Adopt a change made elsewhere (another device, another tab) while nothing
  // here is waiting to be saved. Adjusted during render, not in an effect, so
  // there is no frame showing the stale text. With unsaved typing pending, the
  // local draft wins: last writer wins, per note.
  const [syncedFrom, setSyncedFrom] = useState({ title: note.title, body: note.body });
  if (note.title !== syncedFrom.title || note.body !== syncedFrom.body) {
    setSyncedFrom({ title: note.title, body: note.body });
    if (!dirty) {
      setTitle(note.title);
      setBody(note.body);
    }
  }

  // Auto-grow: size the textarea to its content. The page scroll is restored
  // because collapsing to "auto" for a frame would otherwise jump it.
  useLayoutEffect(() => {
    const ta = bodyRef.current;
    if (!ta) return;
    const y = window.scrollY;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
    if (window.scrollY !== y) window.scrollTo({ top: y });
  }, [body, view]);

  useEffect(() => {
    const t = pendingDiscard.get(note.id);
    if (t) {
      clearTimeout(t);
      pendingDiscard.delete(note.id);
    }
    const id = note.id;
    return () => {
      if (!isBlank(draft.current)) return;
      pendingDiscard.set(
        id,
        setTimeout(() => {
          pendingDiscard.delete(id);
          removeNote(id);
        }, 0)
      );
    };
  }, [note.id, removeNote]);

  // Save whatever is pending when the page is hidden or closed — the debounce
  // would otherwise lose the last 800 ms of typing on iOS app switch.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flush]);

  // ⌘/Ctrl+S saves now; ⌘/Ctrl+E flips Edit/Preview; Esc goes back to the
  // list (the unmount saves).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNow();
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setView(view === "edit" ? "preview" : "edit");
      } else if (e.key === "Escape" && !confirming && !e.defaultPrevented) {
        e.preventDefault();
        router.push("/notes");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveNow, router, confirming, view]);

  const onBodyChange = (value: string) => {
    if (value.length > MAX_NOTE_CHARS) {
      toast("This note has reached its size limit.", { variant: "error" });
      return;
    }
    setBody(value);
    schedule();
  };

  /**
   * Apply a smart edit through execCommand("insertText") so it joins the
   * browser's undo stack (⌘Z undoes a list continuation like any keystroke).
   * It fires a normal input event, so onChange and autosave run as usual. Where
   * execCommand is unavailable, set the value directly — undo is lost, the edit isn't.
   */
  const applyEdit = (edit: TextEdit) => {
    const ta = bodyRef.current;
    if (!ta) return;
    // A toolbar tap may come while the title has focus; insertText acts on the
    // focused element, so focus the body first (without scrolling to it).
    if (document.activeElement !== ta) ta.focus({ preventScroll: true });
    ta.setSelectionRange(edit.from, edit.to);
    let ok = false;
    try {
      ok = edit.insert
        ? document.execCommand("insertText", false, edit.insert)
        : edit.from < edit.to && document.execCommand("delete");
    } catch {
      ok = false;
    }
    if (ok && ta.value === body.slice(0, edit.from) + edit.insert + body.slice(edit.to)) {
      ta.setSelectionRange(edit.selStart, edit.selEnd);
      return;
    }
    const next = body.slice(0, edit.from) + edit.insert + body.slice(edit.to);
    onBodyChange(next);
    requestAnimationFrame(() => ta.setSelectionRange(edit.selStart, edit.selEnd));
  };

  const onBodyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return; // never interrupt an IME composition
    const ta = e.currentTarget;
    const { selectionStart: s, selectionEnd: en, value } = ta;
    if (e.key === "Tab" && !e.metaKey && !e.ctrlKey && !e.altKey && tabIndents(value, s, en)) {
      // Captured even when there is nothing to outdent, so Shift+Tab on a list
      // line doesn't throw focus out of the editor mid-list.
      e.preventDefault();
      const edit = indentLines(value, s, en, e.shiftKey);
      if (edit) applyEdit(edit);
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    let edit: TextEdit | null = null;
    if (mod && !e.shiftKey && key === "b") edit = wrapInline(value, s, en, "**");
    else if (mod && !e.shiftKey && key === "i") edit = wrapInline(value, s, en, "*");
    else if (mod && e.shiftKey && key === "x") edit = wrapInline(value, s, en, "~~");
    else if (e.key === "Enter" && mod) edit = toggleChecklist(value, s, en);
    else if (e.key === "Enter" && !e.shiftKey && !e.altKey) edit = continueList(value, s, en);
    if (!edit) return;
    e.preventDefault();
    applyEdit(edit);
  };

  const onCopy = async () => {
    if (!body) {
      toast("This note has no text to copy.");
      return;
    }
    const ok = await copyText(body);
    toast(ok ? "Copied" : "Couldn't copy — your browser blocked clipboard access.", {
      variant: ok ? "success" : "error",
      duration: ok ? 1500 : 4000,
    });
  };

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const onShare = async () => {
    try {
      await navigator.share({ title: title.trim() || undefined, text: body });
    } catch {
      /* dismissed */
    }
  };

  const onDelete = () => {
    onLeave();
    const removed = removeNote(note.id);
    router.push("/notes");
    if (removed && !isBlank(removed)) {
      // The draft may be ahead of the stored copy by an unsaved debounce.
      const latest = { ...removed, title, body };
      toast("Note deleted", {
        action: { label: "Undo", onClick: () => restoreNote(latest) },
        duration: 6000,
      });
    }
  };

  const runFormat = (run: Format) => {
    const ta = bodyRef.current;
    if (!ta) return;
    const edit = run(ta.value, ta.selectionStart, ta.selectionEnd);
    if (edit) applyEdit(edit);
  };

  const words = countWords(body);
  const chars = body.length;

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 sm:px-0">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/notes"
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm font-medium text-slate-400 transition hover:text-blue-300"
        >
          <ArrowLeft className="h-4 w-4" /> Notes
        </Link>
        <div className="flex items-center gap-2">
          <IconAction
            label={note.pinned ? "Unpin" : "Pin to top"}
            onClick={() => updateNote(note.id, { pinned: !note.pinned }).catch(() => {})}
            active={note.pinned}
            icon={<Pin className={`h-4 w-4 ${note.pinned ? "text-blue-300" : ""}`} />}
          />
          <IconAction label="Copy note" onClick={onCopy} icon={<Copy className="h-4 w-4" />} />
          {canShare && <IconAction label="Share" onClick={onShare} icon={<Share2 className="h-4 w-4" />} />}
          <IconAction
            label="Delete note"
            variant="danger"
            onClick={() => setConfirming(true)}
            icon={<Trash2 className="h-4 w-4" />}
          />
        </div>
      </div>

      {confirming && (
        <div
          role="alertdialog"
          aria-label="Delete this note?"
          className="flex flex-col gap-2 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          onKeyDown={(e) => e.key === "Escape" && setConfirming(false)}
        >
          <p className="text-sm text-slate-200">Delete this note? You can undo for a few seconds.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
            >
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              onClick={onDelete}
              className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1 rounded-2xl border border-slate-800/70 bg-slate-900/70 p-4 shadow-sm focus-within:border-slate-600 sm:p-6">
        <label htmlFor="note-title" className="sr-only">
          Title
        </label>
        <input
          id="note-title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            schedule();
          }}
          onKeyDown={(e) => {
            // Enter in the title moves to the body, like every notes app.
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              const ta = bodyRef.current;
              ta?.focus();
              ta?.setSelectionRange(0, 0);
            }
          }}
          placeholder="Title"
          autoFocus={openedBlank}
          autoComplete="off"
          enterKeyHint="next"
          className="bd-note-title w-full bg-transparent font-semibold tracking-tight text-slate-50 placeholder:text-slate-600 focus:outline-none"
        />
        <div className="pb-2 pt-1">
          <TagEditor
            tags={note.tags}
            counts={tagCounts(api.notes)}
            // Applied at once, not through the debounce — like a pin, a tag
            // organises the note rather than editing it.
            onChange={(tags) => updateNote(note.id, { tags }).catch(() => {})}
          />
        </div>
        {/* Phones: the toggle sits above a full-width toolbar, so all nine
            formats show without scrolling (they don't fit beside it at 375px). */}
        <div className="sticky top-0 z-10 flex flex-col-reverse gap-1 border-b border-slate-800/70 bg-slate-900 py-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          {view === "edit" ? (
            <div role="toolbar" aria-label="Formatting" className="flex min-w-0 gap-0.5 sm:-ml-1.5">
              {FORMATS.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  aria-label={f.label}
                  title={f.keys ? `${f.label} (${f.keys})` : f.label}
                  // mousedown would move focus off the text and lose the selection.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => runFormat(f.run)}
                  className="flex h-9 min-w-0 flex-1 items-center justify-center rounded-lg text-sm text-slate-300 transition hover:bg-slate-800 hover:text-slate-50 sm:h-8 sm:min-w-8 sm:flex-none sm:px-1.5"
                >
                  {f.glyph}
                </button>
              ))}
            </div>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div role="group" aria-label="View" className="flex shrink-0 self-end rounded-full border border-slate-700 p-0.5 text-xs font-semibold sm:self-auto">
            {(["edit", "preview"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                title="⌘/Ctrl+E"
                onClick={() => setView(v)}
                className={`rounded-full px-3 py-1 capitalize transition ${
                  view === v ? "bg-slate-700 text-slate-50" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        {view === "preview" ? (
          body.trim() ? (
            <div className="min-h-[50vh] pt-1">
              <Markdown
                blocks={parseMarkdown(body)}
                // Ticking a box edits the text, so it autosaves like typing.
                onToggleTask={(line) => onBodyChange(toggleTaskLine(body, line))}
              />
            </div>
          ) : (
            <div className="flex min-h-[50vh] flex-col items-start gap-2 pt-2 text-sm text-slate-500">
              Nothing to preview yet.
              <button type="button" onClick={() => setView("edit")} className="font-semibold text-blue-300 hover:text-blue-200">
                Start writing
              </button>
            </div>
          )
        ) : (
          <>
        <label htmlFor="note-body" className="sr-only">
          Note
        </label>
        <textarea
          id="note-body"
          ref={bodyRef}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          onKeyDown={onBodyKeyDown}
          placeholder={"Start writing…\n\nMarkdown works: **bold**, # heading, - list, [ ] task."}
          spellCheck
          autoCapitalize="sentences"
          aria-describedby="note-status note-keys"
          className="min-h-[50vh] w-full resize-none overflow-hidden bg-transparent text-base leading-relaxed text-slate-200 placeholder:text-slate-600 focus:outline-none"
        />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-xs text-slate-500">
        <span id="note-status" role="status" aria-live="polite" className="flex items-center gap-2">
          <span className={autosave.status === "error" ? "text-red-400" : undefined}>
            {statusText(autosave.status, canSync, note.updatedAt, now)}
          </span>
          {autosave.status === "error" && (
            <button
              type="button"
              onClick={() => void saveNow()}
              className="font-semibold text-blue-300 hover:text-blue-200"
            >
              Retry
            </button>
          )}
        </span>
        <span className="tabular-nums">
          {words} {words === 1 ? "word" : "words"} · {chars} {chars === 1 ? "character" : "characters"}
        </span>
        <span id="note-keys" className="hidden w-full sm:block">
          ⌘/Ctrl+S save · ⌘/Ctrl+E preview · ⌘B bold · ⌘I italic · ⌘/Ctrl+Enter checkbox · Tab indent a list · Esc back
        </span>
      </div>
    </article>
  );
}
