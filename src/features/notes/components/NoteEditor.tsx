"use client";

// The note editor: title + auto-growing body, debounced autosave, and
// plain-text list smarts (lib/smartText.ts). Phase 1 — no markdown rendering.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { ArrowLeft, CheckSquare, Clock, Copy, ExternalLink, Lock, Pin, Share2, Trash2, Unlock } from "@/components/icons";
import { IconAction } from "@/components/IconAction";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/toast/ToastProvider";
import { Markdown } from "@/features/notes/components/Markdown";
import { NoteHistory } from "@/features/notes/components/NotesInsights";
import { historyOf } from "@/features/notes/lib/insights";
import { TagEditor } from "@/features/notes/components/TagEditor";
import { SetupForm, UnlockForm } from "@/features/notes/components/VaultForms";
import { useVaults } from "@/features/notes/hooks/useVaults";
import { createVault, decryptNote, encryptNote } from "@/features/notes/lib/vault";
import { addKeys, isUnlocked, keyFor, lock as lockVault, onBeforeLock, subscribe as onVaultChange, touch, useVaultUnlocked } from "@/features/notes/lib/vaultSession";
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

type Draft = { title: string; body: string };

export function NoteEditorScreen({ id }: { id: string }) {
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const email = session?.user?.email ?? null;
  const sync = useNotesSync(email);
  const api = useNotes(email, sync.connected);
  const vault = useVaults(email, sync.connected);
  const unlocked = useVaultUnlocked();
  const note = api.notes.find((n) => n.id === id) ?? null;
  // Set by a delete: the note vanishes a beat before the route changes, and
  // "doesn't exist" shouldn't flash in between.
  const [leaving, setLeaving] = useState(false);

  /* ---- locked notes ---------------------------------------------------- */
  // The decrypted body, held only in memory and only while the vault is open,
  // tagged with the ciphertext it came from. A save sets it alongside the new
  // ciphertext, so the editor never sees its own write as a remote change.
  const [plain, setPlain] = useState<{ ct: string; text: string } | null>(null);
  const [failedCt, setFailedCt] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "setup" | "unlock">(null);
  const pendingLock = useRef<(() => Draft) | null>(null);
  const noteRef = useRef(note);
  useEffect(() => {
    noteRef.current = note;
  });
  // Encrypting is async: saves run one after another so a slow one can never
  // land after (and over) a newer one.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(fn, fn);
    queue.current = run.catch(() => {});
    return run;
  };

  // Locking the vault drops the plaintext from memory too.
  useEffect(() => onVaultChange(() => !isUnlocked() && setPlain(null)), []);

  const lockInfo = note?.lock;
  const key = lockInfo && unlocked ? keyFor(lockInfo.kid) : undefined;
  useEffect(() => {
    if (!lockInfo || !key || plain?.ct === lockInfo.ct) return;
    let cancelled = false;
    decryptNote(key, id, lockInfo).then(
      (text) => !cancelled && setPlain({ ct: lockInfo.ct, text }),
      () => !cancelled && setFailedCt(lockInfo.ct)
    );
    return () => {
      cancelled = true;
    };
  }, [id, lockInfo, key, plain?.ct]);

  const encryptAndStore = (n: Note, kid: string, draft: Draft) =>
    serial(async () => {
      const k = keyFor(kid);
      if (!k) throw new Error("The vault is locked.");
      const sealed = await encryptNote(k, kid, n.id, draft.body);
      setPlain({ ct: sealed.ct, text: draft.body });
      await api.updateNote(n.id, { title: draft.title, lock: sealed });
    });

  const onSave = (draft: Draft): Promise<void> => {
    const n = noteRef.current;
    if (!n) return Promise.resolve();
    if (n.lock) return encryptAndStore(n, n.lock.kid, draft);
    return serial(() => api.updateNote(n.id, draft));
  };

  const performLock = (getDraft: () => Draft) => {
    const n = noteRef.current;
    const kid = vault.primaryKid();
    if (!n || !kid) return;
    encryptAndStore(n, kid, getDraft()).then(
      () => toast("Note locked", { variant: "success", duration: 2000 }),
      () => toast("Couldn't lock the note.", { variant: "error" })
    );
  };

  const requestLock = (getDraft: () => Draft) => {
    if (!vault.ready) {
      toast("Still loading your locked-notes settings — try again in a moment.");
      return;
    }
    pendingLock.current = getDraft;
    if (vault.vaults.length === 0) setDialog("setup");
    else if (!vault.primaryKid()) setDialog("unlock");
    else {
      pendingLock.current = null;
      performLock(getDraft);
    }
  };

  const finishDialog = () => {
    setDialog(null);
    const pending = pendingLock.current;
    pendingLock.current = null;
    if (pending) performLock(pending);
  };

  const removeLock = (draft: Draft) =>
    serial(async () => {
      const n = noteRef.current;
      if (!n) return;
      await api.updateNote(n.id, { title: draft.title, body: draft.body, lock: null });
      setPlain(null);
    });

  const createAndUnlock = async (passphrase: string) => {
    const { record, recoveryCode, key: k } = await createVault(passphrase);
    await vault.putVault(record);
    addKeys([[record.id, k]]);
    return recoveryCode;
  };

  const vaultDialog = (
    <Modal
      open={dialog !== null}
      onClose={() => {
        setDialog(null);
        pendingLock.current = null;
      }}
      labelledBy="vault-title"
    >
      {dialog === "setup" ? (
        <SetupForm onCreate={createAndUnlock} onDone={finishDialog} />
      ) : dialog === "unlock" ? (
        <UnlockForm
          intro={
            <h2 id="vault-title" className="text-lg font-semibold text-slate-50">
              Unlock to lock this note
            </h2>
          }
          onUnlock={async (p) => {
            await vault.unlock(p);
            finishDialog();
          }}
          onRecover={async (c, p) => {
            await vault.recover(c, p);
            finishDialog();
          }}
        />
      ) : null}
    </Modal>
  );

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
  if (note.lock && !key) {
    // Unlocked but no key for THIS note: it was locked with a vault this
    // passphrase didn't open (set up on another device, say).
    const otherVault = unlocked;
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 sm:px-0">
        {back}
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-800/70 bg-slate-900/70 p-6">
          <div className="flex items-center gap-2 text-slate-50">
            <Lock className="h-5 w-5 text-blue-300" />
            <h2 id="vault-title" className="text-lg font-semibold">
              {note.title.trim() || "Locked note"}
            </h2>
          </div>
          <UnlockForm
            intro={
              <p className="text-sm text-slate-400">
                {otherVault
                  ? "This note was locked with a different passphrase. Enter that one to open it."
                  : "This note is locked. Enter your passphrase to open it."}
              </p>
            }
            onUnlock={vault.unlock}
            onRecover={vault.recover}
          />
        </div>
      </div>
    );
  }

  if (note.lock && plain?.ct !== note.lock.ct) {
    return (
      <div className="flex flex-col gap-4 px-3 sm:px-0">
        {back}
        <p className="text-sm text-slate-500" role="status">
          {failedCt === note.lock.ct ? "This note couldn't be decrypted. It may be damaged." : "Unlocking…"}
        </p>
      </div>
    );
  }

  // No sync banner here: the list carries it, and the save status below the
  // editor already says "Saved on this device" when sync is off.
  const source: Draft = note.lock ? { title: note.title, body: plain!.text } : { title: note.title, body: note.body };
  return (
    <>
      <NoteEditor
        key={note.id}
        note={note}
        source={source}
        api={api}
        canSync={api.canSync}
        onLeave={() => setLeaving(true)}
        onSave={onSave}
        onRequestLock={requestLock}
        onRemoveLock={removeLock}
      />
      {vaultDialog}
    </>
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
  source,
  api,
  canSync,
  onLeave,
  onSave,
  onRequestLock,
  onRemoveLock,
}: {
  note: Note;
  /** What the editor shows: the note itself, or a locked note's decrypted body. */
  source: Draft;
  api: ReturnType<typeof useNotes>;
  canSync: boolean;
  onLeave: () => void;
  /** Persists the draft — encrypting first when the note is locked. */
  onSave: (draft: Draft) => Promise<void>;
  onRequestLock: (getDraft: () => Draft) => void;
  onRemoveLock: (draft: Draft) => Promise<void>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { updateNote, removeNote, restoreNote } = api;
  const secure = Boolean(note.lock);

  const [title, setTitle] = useState(source.title);
  const [body, setBody] = useState(source.body);
  const [confirmingUnlock, setConfirmingUnlock] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // The instant History opened (read in the click, not during render).
  const [historyAt, setHistoryAt] = useState<Date | null>(null);
  const [now] = useState(() => new Date());
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // A brand-new note opens with the cursor in the title.
  const [openedBlank] = useState(() => !note.lock && isBlank(note));
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

  const autosave = useAutosave(() => onSave(draft.current));
  const { schedule: scheduleSave, flush, saveNow, hasPending, dirty } = autosave;
  // Typing in an unlocked note counts as activity for the vault's idle lock.
  const schedule = () => {
    if (secure) touch();
    scheduleSave();
  };

  // If the vault locks with typing still pending, save it — encrypted — first.
  useEffect(
    () =>
      onBeforeLock(async () => {
        if (hasPending()) await saveNow();
      }),
    [hasPending, saveNow]
  );

  // Adopt a change made elsewhere (another device, another tab) while nothing
  // here is waiting to be saved. Adjusted during render, not in an effect, so
  // there is no frame showing the stale text. With unsaved typing pending, the
  // local draft wins: last writer wins, per note.
  const [syncedFrom, setSyncedFrom] = useState(source);
  if (source.title !== syncedFrom.title || source.body !== syncedFrom.body) {
    setSyncedFrom(source);
    if (!dirty) {
      setTitle(source.title);
      setBody(source.body);
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

  const lockedRef = useRef(secure);
  useEffect(() => {
    lockedRef.current = secure;
  });

  useEffect(() => {
    const t = pendingDiscard.get(note.id);
    if (t) {
      clearTimeout(t);
      pendingDiscard.delete(note.id);
    }
    const id = note.id;
    return () => {
      // Never discard a locked note: its title may be blank by design.
      if (lockedRef.current || !isBlank(draft.current)) return;
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
      // The draft may be ahead of the stored copy by an unsaved debounce — but a
      // locked note is restored exactly as stored: encrypted, body empty.
      const latest = removed.lock ? removed : { ...removed, title, body };
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
          <IconAction
            label={secure ? "Remove lock" : "Lock note"}
            active={secure}
            onClick={() => (secure ? setConfirmingUnlock(true) : onRequestLock(() => draft.current))}
            icon={secure ? <Lock className="h-4 w-4 text-blue-300" /> : <Unlock className="h-4 w-4" />}
          />
          {canShare && <IconAction label="Share" onClick={onShare} icon={<Share2 className="h-4 w-4" />} />}
          <IconAction label="History" onClick={() => setHistoryAt(new Date())} icon={<Clock className="h-4 w-4" />} />
          <IconAction
            label="Delete note"
            variant="danger"
            onClick={() => setConfirming(true)}
            icon={<Trash2 className="h-4 w-4" />}
          />
        </div>
      </div>

      {historyAt && <NoteHistory open onClose={() => setHistoryAt(null)} events={historyOf(note)} now={historyAt} />}

      {confirmingUnlock && (
        <div
          role="alertdialog"
          aria-label="Remove the lock?"
          className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          onKeyDown={(e) => e.key === "Escape" && setConfirmingUnlock(false)}
        >
          <p className="text-sm text-slate-200">Remove the lock? The note will be stored unencrypted again.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmingUnlock(false)}
              className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
            >
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => {
                setConfirmingUnlock(false);
                onRemoveLock(draft.current).catch(() => toast("Couldn't remove the lock.", { variant: "error" }));
              }}
              className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"
            >
              Remove lock
            </button>
          </div>
        </div>
      )}

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
          {secure && (
            <span className="flex items-center gap-1 text-blue-300">
              <Lock className="h-3.5 w-3.5" /> Encrypted ·
            </span>
          )}
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
          {secure && (
            <button
              type="button"
              onClick={() => void lockVault()}
              className="font-semibold text-blue-300 hover:text-blue-200"
            >
              Lock now
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
