"use client";

// The Notes pillar's list: pinned first, then most recently edited. Phase 1 —
// no search, tags UI or markdown yet (see CLAUDE.md → Notes feature).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { ClipboardPaste, Plus, StickyNote } from "@/components/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { useToast } from "@/components/toast/ToastProvider";
import { NoteCard } from "@/features/notes/components/NoteCard";
import { NotesSyncBanner } from "@/features/notes/components/NotesSyncBanner";
import { useNotes } from "@/features/notes/hooks/useNotes";
import { useNotesSync } from "@/features/notes/hooks/useNotesSync";
import { copyText, readText } from "@/features/notes/lib/clipboard";
import { MAX_NOTE_CHARS, type Note } from "@/features/notes/lib/notes";

const isTyping = (el: Element | null) =>
  !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);

export function NotesDashboard() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;
  const sync = useNotesSync(email);
  const { notes, hydrated, createNote, updateNote } = useNotes(email, sync.connected);
  const [pasting, setPasting] = useState(false);
  // One clock for every card's "edited 5m ago", ticking each minute. Notes only
  // render after mount (they come from localStorage), so SSR never sees it.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const onNew = () => {
    const note = createNote();
    router.push(`/notes/${note.id}`);
  };

  // "N" starts a note from anywhere on the list (not while typing elsewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "n" || e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return;
      e.preventDefault();
      const note = createNote();
      router.push(`/notes/${note.id}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createNote, router]);

  const onPaste = async () => {
    setPasting(true);
    const text = await readText();
    setPasting(false);
    if (text === null) {
      toast("Couldn't read the clipboard. Allow clipboard access, or start a new note and paste into it.", {
        variant: "error",
      });
      return;
    }
    if (!text.trim()) {
      toast("The clipboard has no text to paste.");
      return;
    }
    if (text.length > MAX_NOTE_CHARS) {
      toast("That's too long for one note.", { variant: "error" });
      return;
    }
    const note = createNote({ body: text });
    toast("Pasted as a new note", {
      variant: "success",
      action: { label: "Open", onClick: () => router.push(`/notes/${note.id}`) },
    });
  };

  const onCopy = async (note: Note) => {
    if (!note.body) {
      toast("This note has no text to copy.");
      return;
    }
    const ok = await copyText(note.body);
    toast(ok ? "Copied" : "Couldn't copy — your browser blocked clipboard access.", {
      variant: ok ? "success" : "error",
      duration: ok ? 1500 : 4000,
    });
  };

  const onTogglePin = (note: Note) => {
    updateNote(note.id, { pinned: !note.pinned }).catch(() => {});
  };

  const pinned = notes.filter((n) => n.pinned);
  const rest = notes.filter((n) => !n.pinned);

  const grid = (list: Note[]) => (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((n) => (
        <NoteCard key={n.id} note={n} now={now} onCopy={onCopy} onTogglePin={onTogglePin} />
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 px-3 sm:px-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-50">
              <StickyNote className="h-6 w-6 text-blue-400" /> Notes
            </h2>
            <p className="mt-1 text-sm text-slate-400">Jot it down, find it later, copy it out in one tap.</p>
          </div>
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0 bd-no-scrollbar">
            <button
              type="button"
              onClick={onNew}
              aria-keyshortcuts="N"
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
            >
              <Plus className="h-4 w-4" /> New note
            </button>
            <button
              type="button"
              onClick={onPaste}
              disabled={pasting}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-blue-400 hover:text-blue-300 disabled:opacity-50"
            >
              <ClipboardPaste className="h-4 w-4" /> Paste as new note
            </button>
          </div>
        </div>
      </div>

      <NotesSyncBanner {...sync} email={email} />

      <div className="flex flex-col gap-5 px-3 sm:px-0">
        {!hydrated ? null : notes.length === 0 ? (
          <EmptyState
            action={
              <button
                type="button"
                onClick={onNew}
                className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
              >
                Write your first note
              </button>
            }
          >
            No notes yet. Start one, or copy some text and use &ldquo;Paste as new note&rdquo;.
          </EmptyState>
        ) : pinned.length > 0 ? (
          <>
            <section className="flex flex-col gap-2">
              <SectionLabel>Pinned</SectionLabel>
              {grid(pinned)}
            </section>
            {rest.length > 0 && (
              <section className="flex flex-col gap-2">
                <SectionLabel>Notes</SectionLabel>
                {grid(rest)}
              </section>
            )}
          </>
        ) : (
          grid(rest)
        )}
      </div>
    </div>
  );
}
