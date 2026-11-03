"use client";

// The Notes pillar's list: pinned first, then most recently edited, with
// search and a tag filter (phase 2). See CLAUDE.md → Notes feature.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { Archive, BarChart, ClipboardPaste, Lock, Plus, Search, StickyNote, X } from "@/components/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/toast/ToastProvider";
import { useSaveFailedToast } from "@/features/notes/hooks/useSaveFailedToast";
import { NoteCard } from "@/features/notes/components/NoteCard";
import { NotesBackupDialog } from "@/features/notes/components/NotesBackupDialog";
import { NotesInsights } from "@/features/notes/components/NotesInsights";
import { useDeletionLog } from "@/features/notes/hooks/useDeletionLog";
import { MilestoneRow } from "@/components/MilestoneRow";
import { NotesSyncBanner } from "@/features/notes/components/NotesSyncBanner";
import { TagFilter } from "@/features/notes/components/TagFilter";
import { useNotes } from "@/features/notes/hooks/useNotes";
import { useNotesSync } from "@/features/notes/hooks/useNotesSync";
import { useVaults } from "@/features/notes/hooks/useVaults";
import { copyText, readText } from "@/features/notes/lib/clipboard";
import { MAX_NOTE_CHARS, type Note } from "@/features/notes/lib/notes";
import { isActive, parseQuery, searchNotes, type NoteHit } from "@/features/notes/lib/search";
import { tagCounts } from "@/features/notes/lib/tags";
import { lock as lockVault, useVaultUnlocked } from "@/features/notes/lib/vaultSession";
import { consumeNewNoteIntent, NEW_NOTE_NUDGE } from "@/lib/notesIndex";
import { CONFLICTS_FOUND } from "@/features/notes/lib/conflicts";

const isTyping = (el: Element | null) =>
  !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);

/**
 * Mirror the search into the URL (?q=, ?tag=) without a navigation, so Back from
 * a note returns to the same results and a filtered list can be bookmarked.
 * Passing history.state through keeps the App Router's own entry intact.
 */
function syncUrl(q: string, tag: string | null) {
  const url = new URL(window.location.href);
  if (q.trim()) url.searchParams.set("q", q);
  else url.searchParams.delete("q");
  if (tag) url.searchParams.set("tag", tag);
  else url.searchParams.delete("tag");
  window.history.replaceState(window.history.state, "", url);
}

export function NotesDashboard({
  initialQuery = "",
  initialTag = null,
}: {
  initialQuery?: string;
  initialTag?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  useSaveFailedToast();
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? null;
  const sync = useNotesSync(email);
  const { notes, hydrated, canSync, createNote, updateNote, retag, importNotes } = useNotes(email, sync.connected);
  const deletions = useDeletionLog(email, canSync);
  // The instant Insights opened: the dialog's "this week" and "untouched for"
  // are measured from it, and reading the clock in a click keeps render pure.
  const [insightsAt, setInsightsAt] = useState<Date | null>(null);
  const vault = useVaults(email, sync.connected);
  const [backupOpen, setBackupOpen] = useState(false);
  const [pasting, setPasting] = useState(false);
  const vaultOpen = useVaultUnlocked();
  const [query, setQuery] = useState(initialQuery);
  const [tag, setTag] = useState<string | null>(initialTag);
  const searchRef = useRef<HTMLInputElement>(null);

  const changeQuery = (q: string) => {
    setQuery(q);
    syncUrl(q, tag);
  };
  const changeTag = (t: string | null) => {
    setTag(t);
    syncUrl(query, t);
  };
  // One clock for every card's "edited 5m ago", ticking each minute. Notes only
  // render after mount (they come from localStorage), so SSR never sees it.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Nothing is created until the session (whose email keys the cache) and that
  // account's notes have loaded: a note made earlier was filed under no account
  // and the editor, opening a beat later under the real one, couldn't find it.
  const ready = status !== "loading" && hydrated;

  // "New note" from ⌘K: honoured once this account's notes have loaded (the same
  // gate as the button), and again on the nudge when the list is already open.
  useEffect(() => {
    if (!ready) return;
    const take = () => {
      if (!consumeNewNoteIntent()) return;
      const note = createNote();
      router.push(`/notes/${note.id}`);
    };
    take();
    window.addEventListener(NEW_NOTE_NUDGE, take);
    return () => window.removeEventListener(NEW_NOTE_NUDGE, take);
  }, [ready, createNote, router]);

  // A reconnect found notes edited on two devices and kept both (lib/conflicts.ts).
  useEffect(() => {
    const onConflicts = (e: Event) => {
      const n = (e as CustomEvent<{ count: number }>).detail?.count ?? 0;
      if (!n) return;
      toast(
        n === 1
          ? "A note was edited on two devices — both versions kept (see #conflict)"
          : `${n} notes were edited on two devices — both versions kept (see #conflict)`,
        { variant: "default" }
      );
    };
    window.addEventListener(CONFLICTS_FOUND, onConflicts);
    return () => window.removeEventListener(CONFLICTS_FOUND, onConflicts);
  }, [toast]);

  const onNew = () => {
    if (!ready) return;
    const note = createNote();
    router.push(`/notes/${note.id}`);
  };

  // "N" starts a note and "/" jumps to search, from anywhere on the list (not
  // while typing elsewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "n" && ready) {
        e.preventDefault();
        const note = createNote();
        router.push(`/notes/${note.id}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createNote, router, ready]);

  const onPaste = async () => {
    if (!ready) return;
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
    if (note.lock) {
      toast("This note is locked — open it and unlock to copy.");
      return;
    }
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

  const onRenameTag = (from: string, to: string) => {
    const n = retag(from, to);
    const target = to;
    changeTag(target);
    toast(`Renamed #${from} to #${target} on ${n === 1 ? "1 note" : `${n} notes`}`, { variant: "success" });
  };

  const onDeleteTag = (t: string) => {
    // Remember each note's tags so Undo can put them back exactly.
    const before = notes.filter((n) => n.tags.includes(t)).map((n) => [n.id, n.tags] as const);
    const n = retag(t, null);
    changeTag(null);
    toast(`Removed #${t} from ${n === 1 ? "1 note" : `${n} notes`}`, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => before.forEach(([id, tags]) => void updateNote(id, { tags }).catch(() => {})),
      },
    });
  };

  const counts = tagCounts(notes);
  const parsed = parseQuery(query);
  const filtering = isActive(parsed) || tag !== null;
  const hits = searchNotes(notes, query, tag);

  const grid = (list: NoteHit[]) => (
    // As many columns as the width allows (one on a phone, four on a wide screen),
    // so a short list sits side by side instead of stacking in the first column.
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3">
      {list.map((h) => (
        <NoteCard
          key={h.note.id}
          hit={h}
          now={now}
          activeTag={tag}
          onCopy={onCopy}
          onTogglePin={onTogglePin}
          onTagClick={(t) => changeTag(tag === t ? null : t)}
        />
      ))}
    </ul>
  );
  const pinned = hits.filter((h) => h.note.pinned);
  const rest = hits.filter((h) => !h.note.pinned);
  const describe = [query.trim() && `“${query.trim()}”`, tag && `#${tag}`].filter(Boolean).join(" in ");

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
              disabled={!ready}
              aria-keyshortcuts="N"
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> New note
            </button>
            <button
              type="button"
              onClick={onPaste}
              disabled={pasting || !ready}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-blue-400 hover:text-blue-300 disabled:opacity-50"
            >
              <ClipboardPaste className="h-4 w-4" /> Paste as new note
            </button>
            <button
              type="button"
              onClick={() => setBackupOpen(true)}
              disabled={!ready}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 disabled:opacity-50"
            >
              <Archive className="h-4 w-4" /> Backup
            </button>
            <button
              type="button"
              onClick={() => setInsightsAt(new Date())}
              disabled={!ready}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500 disabled:opacity-50"
            >
              <BarChart className="h-4 w-4" /> Insights
            </button>
            {vaultOpen && (
              <button
                type="button"
                onClick={() => void lockVault()}
                title="Locked notes are open on this device. Lock them now."
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-blue-400/60 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-blue-300 transition hover:border-blue-300"
              >
                <Lock className="h-4 w-4" /> Lock notes
              </button>
            )}
          </div>
        </div>
      </div>

      <NotesSyncBanner {...sync} email={email} />

      {insightsAt && (
        <NotesInsights
          open
          onClose={() => setInsightsAt(null)}
          notes={notes}
          deletions={deletions}
          now={insightsAt}
        />
      )}

      <NotesBackupDialog
        open={backupOpen}
        onClose={() => setBackupOpen(false)}
        notes={notes}
        vaults={vault.vaults}
        onRestore={(plan, newVaults) => {
          // Vaults first, so restored locked notes can be opened at once.
          newVaults.forEach((v) => void vault.putVault(v));
          importNotes(plan.write);
          const n = plan.write.length;
          toast(n ? `Restored ${n === 1 ? "1 note" : `${n} notes`}` : "Restored", { variant: "success" });
        }}
      />

      <MilestoneRow
        className="px-3 sm:px-0"
        celebrate={{ account: email, ready: hydrated }}
        metrics={{ notes: notes.length }}
      />

      {hydrated && notes.length > 0 && (
        <div className="flex flex-col gap-3 px-3 sm:px-0">
          <div role="search" className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => changeQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  changeQuery("");
                  e.currentTarget.blur();
                }
              }}
              placeholder="Search notes, or #tag"
              aria-label="Search notes"
              aria-keyshortcuts="/"
              autoComplete="off"
              enterKeyHint="search"
              className="w-full rounded-full border border-slate-800 bg-slate-900 py-2 pl-9 pr-10 text-slate-100 placeholder:text-slate-500 focus:border-blue-400 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  changeQuery("");
                  searchRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <TagFilter counts={counts} active={tag} onSelect={changeTag} onRename={onRenameTag} onDelete={onDeleteTag} />
        </div>
      )}

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
        ) : filtering ? (
          <section className="flex flex-col gap-2" aria-label="Search results">
            <p role="status" className="text-xs text-slate-500">
              {hits.length === 0
                ? `No notes match ${describe}.`
                : `${hits.length === 1 ? "1 note" : `${hits.length} notes`} · ${describe}`}
            </p>
            {hits.length === 0 ? (
              <EmptyState
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setTag(null);
                      syncUrl("", null);
                    }}
                    className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                  >
                    Clear search
                  </button>
                }
              >
                Nothing found. Try fewer words, or check the spelling.
              </EmptyState>
            ) : (
              grid(hits)
            )}
          </section>
        ) : (
          // One flowing grid, pinned first. Two stacked sections (a "Pinned" grid,
          // then a "Notes" grid) left a lone card at the start of each row on a wide
          // screen; a pinned note is marked by its filled pin and blue edge instead.
          grid([...pinned, ...rest])
        )}
      </div>
    </div>
  );
}
