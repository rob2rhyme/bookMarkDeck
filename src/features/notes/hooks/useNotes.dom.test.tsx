import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/notes/data/notesData", () => ({
  deleteNote: vi.fn(async () => {}),
  fetchNotes: vi.fn(async () => []),
  saveNote: vi.fn(async () => {}),
  appendDeletion: vi.fn(async () => {}),
  saveDeletions: vi.fn(async () => {}),
  subscribeDeletions: vi.fn(() => () => {}),
  subscribeNotes: vi.fn(() => () => {}),
}));

import { deleteNote, fetchNotes, saveNote, subscribeNotes } from "@/features/notes/data/notesData";
import type { Note } from "@/features/notes/lib/notes";
import { pendingDeleteIds, pendingUpsertIds } from "@/utils/pendingDeletes";
import { recordSyncedIds, syncedIds } from "@/utils/syncedIds";
import { useNotes } from "./useNotes";

const EMAIL = "a@example.com";
const KEY = `bookmarkdeck:notes:v1:${EMAIL}`;
const note = (id: string, over: Partial<Note> = {}): Note => ({
  id,
  title: id,
  body: "",
  pinned: false,
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});
const cached = () => JSON.parse(localStorage.getItem(KEY) ?? "[]") as Note[];

beforeEach(() => {
  localStorage.clear();
  vi.mocked(saveNote).mockReset().mockResolvedValue();
  vi.mocked(deleteNote).mockReset().mockResolvedValue();
  vi.mocked(fetchNotes).mockReset().mockResolvedValue([]);
  vi.mocked(subscribeNotes).mockReset().mockReturnValue(() => {});
});

describe("useNotes — local", () => {
  it("hydrates from the per-user cache after mount, sorted", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([note("a"), note("b", { updatedAt: "2026-02-01T00:00:00.000Z" }), note("p", { pinned: true }), { bad: 1 }])
    );
    const { result } = renderHook(() => useNotes(EMAIL, false));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.notes.map((n) => n.id)).toEqual(["p", "b", "a"]);
  });

  it("writes the cache synchronously on every change", async () => {
    const { result } = renderHook(() => useNotes(EMAIL, false));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    let id = "";
    act(() => {
      id = result.current.createNote({ body: "hello" }).id;
    });
    expect(cached().map((n) => n.body)).toEqual(["hello"]);
    act(() => void result.current.updateNote(id, { title: "T" }));
    expect(cached()[0].title).toBe("T");
  });

  it("bumps updatedAt on an edit but not on a pin, and skips no-op patches", async () => {
    localStorage.setItem(KEY, JSON.stringify([note("a", { body: "x" })]));
    const { result } = renderHook(() => useNotes(EMAIL, false));
    await waitFor(() => expect(result.current.notes).toHaveLength(1));
    act(() => void result.current.updateNote("a", { pinned: true }));
    expect(cached()[0]).toMatchObject({ pinned: true, updatedAt: "2026-01-01T00:00:00.000Z" });
    act(() => void result.current.updateNote("a", { body: "x" }));
    expect(cached()[0].updatedAt).toBe("2026-01-01T00:00:00.000Z");
    act(() => void result.current.updateNote("a", { body: "y" }));
    expect(cached()[0].updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
  });

  it("restores a removed note (Undo)", async () => {
    localStorage.setItem(KEY, JSON.stringify([note("a")]));
    const { result } = renderHook(() => useNotes(EMAIL, false));
    await waitFor(() => expect(result.current.notes).toHaveLength(1));
    let removed: Note | null = null;
    act(() => {
      removed = result.current.removeNote("a");
    });
    expect(result.current.notes).toHaveLength(0);
    act(() => result.current.restoreNote(removed!));
    expect(result.current.notes.map((n) => n.id)).toEqual(["a"]);
  });

  it("adopts a change another instance in this tab made after it", async () => {
    const list = renderHook(() => useNotes(EMAIL, false));
    const editor = renderHook(() => useNotes(EMAIL, false));
    await waitFor(() => expect(editor.result.current.hydrated).toBe(true));
    act(() => void editor.result.current.createNote({ body: "from the editor" }));
    expect(list.result.current.notes.map((n) => n.body)).toEqual(["from the editor"]);
  });

  it("an Undo from an unmounted instance keeps what the list did since", async () => {
    localStorage.setItem(KEY, JSON.stringify([note("a")]));
    const editor = renderHook(() => useNotes(EMAIL, false));
    await waitFor(() => expect(editor.result.current.notes).toHaveLength(1));
    let removed: Note | null = null;
    act(() => {
      removed = editor.result.current.removeNote("a");
    });
    const { restoreNote } = editor.result.current;
    editor.unmount(); // the editor navigated back to the list
    const list = renderHook(() => useNotes(EMAIL, false));
    await waitFor(() => expect(list.result.current.hydrated).toBe(true));
    act(() => void list.result.current.createNote({ body: "written on the list" }));
    act(() => restoreNote(removed!)); // the toast's Undo, bound to the old instance
    expect(cached().map((n) => n.body ?? n.id).sort()).toEqual(["", "written on the list"]);
    expect(list.result.current.notes.map((n) => n.id)).toContain("a");
  });

  it("adopts another tab's write (storage event)", async () => {
    const { result } = renderHook(() => useNotes(EMAIL, false));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    localStorage.setItem(KEY, JSON.stringify([note("other-tab")]));
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: KEY, storageArea: localStorage }));
    });
    expect(result.current.notes.map((n) => n.id)).toEqual(["other-tab"]);
  });
});

describe("useNotes — sync", () => {
  it("writes straight to Firestore while connected", async () => {
    const { result } = renderHook(() => useNotes(EMAIL, true));
    await waitFor(() => expect(subscribeNotes).toHaveBeenCalled());
    let n: Note | null = null;
    act(() => {
      n = result.current.createNote();
    });
    expect(saveNote).toHaveBeenCalledWith(EMAIL, n);
    act(() => void result.current.removeNote(n!.id));
    expect(deleteNote).toHaveBeenCalledWith(EMAIL, n!.id);
  });

  it("queues offline changes and pushes them on connect, before subscribing", async () => {
    // "a" and "b" were in the cloud at the last sync; "gone" was deleted elsewhere since.
    const cloud = [note("a"), note("b")];
    recordSyncedIds("notes", EMAIL, ["a", "b", "gone"]);
    localStorage.setItem(KEY, JSON.stringify([...cloud, note("gone")]));
    vi.mocked(fetchNotes).mockResolvedValue(cloud);

    const { result, rerender } = renderHook(({ on }) => useNotes(EMAIL, on), { initialProps: { on: false } });
    await waitFor(() => expect(result.current.notes).toHaveLength(3));
    let fresh: Note | null = null;
    act(() => {
      void result.current.updateNote("a", { body: "edited offline" });
      void result.current.removeNote("b");
      fresh = result.current.createNote({ body: "new offline" });
    });
    expect(saveNote).not.toHaveBeenCalled();

    rerender({ on: true });
    await waitFor(() => expect(subscribeNotes).toHaveBeenCalled());
    expect(deleteNote).toHaveBeenCalledWith(EMAIL, "b");
    const pushed = vi.mocked(saveNote).mock.calls.map(([, n]) => n.id).sort();
    // The offline edit and the new note go up; the note deleted elsewhere does not come back.
    expect(pushed).toEqual(["a", fresh!.id].sort());
  });

  it("marks the cloud as loaded on the first snapshot and adopts it", async () => {
    let push: (n: Note[]) => void = () => {};
    vi.mocked(subscribeNotes).mockImplementation((_e, cb) => {
      push = (n) => cb(n, { fromCache: false, hasPendingWrites: false });
      return () => {};
    });
    const { result } = renderHook(() => useNotes(EMAIL, true));
    await waitFor(() => expect(subscribeNotes).toHaveBeenCalled());
    expect(result.current.cloudLoaded).toBe(false);
    act(() => push([note("remote")]));
    expect(result.current.cloudLoaded).toBe(true);
    expect(result.current.notes.map((n) => n.id)).toEqual(["remote"]);
    expect(cached().map((n) => n.id)).toEqual(["remote"]);
  });

  // A live listener fires at once from this device's own unconfirmed write,
  // before the server has seen it — recording that id as "the cloud already
  // has this" risks never re-uploading it if the write never lands.
  it("doesn't record an id from a snapshot carrying unacknowledged writes", async () => {
    vi.mocked(subscribeNotes).mockImplementation((_e, cb) => {
      cb([note("new")], { fromCache: false, hasPendingWrites: true });
      return () => {};
    });
    renderHook(() => useNotes(EMAIL, true));
    await waitFor(() => expect(subscribeNotes).toHaveBeenCalled());
    expect(syncedIds("notes", EMAIL).has("new")).toBe(false);
  });
});

describe("useNotes — tags", () => {
  it("normalises a tag patch and doesn't bump updatedAt", async () => {
    localStorage.setItem(KEY, JSON.stringify([note("a")]));
    const { result } = renderHook(() => useNotes(EMAIL, false));
    await waitFor(() => expect(result.current.notes).toHaveLength(1));
    act(() => void result.current.updateNote("a", { tags: ["#Work", "work", "To Do"] }));
    expect(cached()[0]).toMatchObject({ tags: ["work", "to-do"], updatedAt: "2026-01-01T00:00:00.000Z" });
  });

  it("renames a tag everywhere, merging duplicates, and removes one everywhere", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([note("a", { tags: ["old", "keep"] }), note("b", { tags: ["old", "new"] }), note("c", { tags: ["x"] })])
    );
    const { result } = renderHook(() => useNotes(EMAIL, false));
    await waitFor(() => expect(result.current.notes).toHaveLength(3));
    let n = 0;
    act(() => {
      n = result.current.retag("old", "New");
    });
    expect(n).toBe(2);
    const byId = () => Object.fromEntries(cached().map((x) => [x.id, x.tags]));
    expect(byId()).toEqual({ a: ["new", "keep"], b: ["new"], c: ["x"] });
    act(() => {
      n = result.current.retag("new", null);
    });
    expect(n).toBe(2);
    expect(byId()).toEqual({ a: ["keep"], b: [], c: ["x"] });
    expect(result.current.retag("missing", null)).toBe(0);
    expect(result.current.retag("keep", "#keep")).toBe(0);
  });
});

describe("useNotes — history and the deletion log", () => {
  const kinds = (n?: Note) => (n?.activity ?? []).map((e) => e.kind);

  it("records what happened, never what the note said", async () => {
    const { result } = renderHook(() => useNotes(EMAIL, false));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    let id = "";
    act(() => {
      id = result.current.createNote({ body: "wifi: hunter2" }).id;
    });
    act(() => void result.current.updateNote(id, { body: "wifi: hunter3" }));
    act(() => void result.current.updateNote(id, { body: "wifi: hunter4" }));
    act(() => void result.current.updateNote(id, { pinned: true }));
    act(() => void result.current.updateNote(id, { tags: ["Home", "net"] }));
    const n = cached().find((x) => x.id === id);
    expect(kinds(n)).toEqual(["created", "edited", "pinned", "tagged"]);
    expect(n?.activity?.[1].n).toBe(2); // two saves, one entry
    expect(n?.activity?.[3]).toMatchObject({ added: ["home", "net"] });
    expect(JSON.stringify(n?.activity)).not.toContain("hunter");
  });

  it("records locking and unlocking, and an edit of a locked note's text", async () => {
    localStorage.setItem(KEY, JSON.stringify([note("n1", { body: "secret" })]));
    const { result } = renderHook(() => useNotes(EMAIL, false));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    const lock = (ct: string) => ({ kid: "v", iv: "i", ct });
    act(() => void result.current.updateNote("n1", { lock: lock("a"), body: "" }));
    act(() => void result.current.updateNote("n1", { lock: lock("b") }));
    act(() => void result.current.updateNote("n1", { lock: null, body: "secret" }));
    expect(kinds(cached()[0])).toEqual(["locked", "edited", "unlocked"]);
  });

  it("logs a delete for the account, and Undo shows on the note as Restored", async () => {
    localStorage.setItem(KEY, JSON.stringify([note("n1", { title: "Plan" })]));
    const { result } = renderHook(() => useNotes(EMAIL, false));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    let removed: Note | null = null;
    act(() => {
      removed = result.current.removeNote("n1");
    });
    const log = JSON.parse(localStorage.getItem(`bookmarkdeck:notes:deleted:v1:${EMAIL}`) ?? "[]");
    expect(log).toEqual([expect.objectContaining({ id: "n1", title: "Plan" })]);
    act(() => result.current.restoreNote(removed!));
    expect(kinds(cached()[0])).toEqual(["restored"]);
  });

  it("marks notes restored from a backup", async () => {
    const { result } = renderHook(() => useNotes(EMAIL, false));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => result.current.importNotes([note("b1")]));
    expect(kinds(cached()[0])).toEqual(["imported"]);
  });
});

describe("useNotes — edited on two devices", () => {
  it("on reconnect keeps both versions, announces it, and doesn't overwrite the newer edit", async () => {
    // This device last saw "a" at 01:00, then edited it offline (now). Another
    // device edited it meanwhile — later still, so its version is the newer one.
    const seen = "2026-10-21T01:00:00.000Z";
    localStorage.setItem(`bookmarkdeck:notes:base:v1:${EMAIL}`, JSON.stringify({ a: seen }));
    recordSyncedIds("notes", EMAIL, ["a"]);
    localStorage.setItem(KEY, JSON.stringify([note("a", { body: "seen", updatedAt: seen })]));
    const theirs = note("a", { body: "edited on the phone", updatedAt: "2099-01-01T00:00:00.000Z" });
    vi.mocked(fetchNotes).mockResolvedValue([theirs]);
    const announced = vi.fn();
    window.addEventListener("bd:notes-conflicts", announced);

    const { result, rerender } = renderHook(({ on }) => useNotes(EMAIL, on), { initialProps: { on: false } });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => void result.current.updateNote("a", { body: "edited on the laptop" }));

    rerender({ on: true });
    await waitFor(() => expect(subscribeNotes).toHaveBeenCalled());
    const pushed = vi.mocked(saveNote).mock.calls.map(([, n]) => n);
    // The phone's newer text is NOT overwritten; the laptop's is saved as a copy.
    expect(pushed.some((n) => n.id === "a")).toBe(false);
    expect(pushed).toEqual([
      expect.objectContaining({ title: "a (conflicted copy)", body: "edited on the laptop", tags: ["conflict"] }),
    ]);
    expect(announced).toHaveBeenCalledTimes(1);
    window.removeEventListener("bd:notes-conflicts", announced);
  });

  it("records the cloud version it sees, so the next reconnect can tell", async () => {
    let push: (n: Note[]) => void = () => {};
    vi.mocked(subscribeNotes).mockImplementation((_e, cb) => {
      push = (n) => cb(n, { fromCache: false, hasPendingWrites: false });
      return () => {};
    });
    renderHook(() => useNotes(EMAIL, true));
    await waitFor(() => expect(subscribeNotes).toHaveBeenCalled());
    act(() => push([note("r", { updatedAt: "2026-10-21T05:00:00.000Z" })]));
    expect(JSON.parse(localStorage.getItem(`bookmarkdeck:notes:base:v1:${EMAIL}`) ?? "{}")).toEqual({
      r: "2026-10-21T05:00:00.000Z",
    });
  });
});

// Signed in but offline: Firestore holds a write in this tab's memory until the
// server has it, so its promise never settles — and a tab closed meanwhile loses
// it. Each change is queued first, so the next load can still send it.
describe("useNotes — signed in, offline, tab closed", () => {
  const never = () => new Promise<void>(() => {});

  it("an edit and a delete survive the tab closing and are sent on the next load", async () => {
    const cloud = [note("a"), note("b")];
    recordSyncedIds("notes", EMAIL, ["a", "b"]);
    localStorage.setItem(KEY, JSON.stringify(cloud));
    vi.mocked(fetchNotes).mockResolvedValue(cloud);
    vi.mocked(saveNote).mockImplementation(never);
    vi.mocked(deleteNote).mockImplementation(never);

    const tab = renderHook(() => useNotes(EMAIL, true));
    await waitFor(() => expect(subscribeNotes).toHaveBeenCalled());
    act(() => {
      void tab.result.current.updateNote("a", { body: "edited offline" });
      void tab.result.current.removeNote("b");
    });
    tab.unmount(); // closed before the network came back

    vi.mocked(saveNote).mockReset().mockResolvedValue();
    vi.mocked(deleteNote).mockReset().mockResolvedValue();
    renderHook(() => useNotes(EMAIL, true));
    await waitFor(() => expect(subscribeNotes).toHaveBeenCalledTimes(2));
    expect(deleteNote).toHaveBeenCalledWith(EMAIL, "b");
    expect(saveNote).toHaveBeenCalledWith(EMAIL, expect.objectContaining({ id: "a", body: "edited offline" }));
    expect(pendingUpsertIds("notes", EMAIL).size).toBe(0);
    expect(pendingDeleteIds("notes", EMAIL).size).toBe(0);
  });

  it("an edit leaves the queue only once the cloud has it", async () => {
    let land: () => void = () => {};
    vi.mocked(saveNote).mockImplementation(() => new Promise<void>((res) => (land = res)));
    const { result } = renderHook(() => useNotes(EMAIL, true));
    await waitFor(() => expect(subscribeNotes).toHaveBeenCalled());
    let id = "";
    act(() => {
      id = result.current.createNote({ body: "x" }).id;
    });
    expect(pendingUpsertIds("notes", EMAIL)).toEqual(new Set([id]));
    await act(async () => land());
    expect(pendingUpsertIds("notes", EMAIL).size).toBe(0);
  });

  it("a save resolves once it is on this device, so the editor's next save isn't held up", async () => {
    vi.mocked(saveNote).mockImplementation(never);
    const { result } = renderHook(() => useNotes(EMAIL, true));
    await waitFor(() => expect(subscribeNotes).toHaveBeenCalled());
    let id = "";
    act(() => {
      id = result.current.createNote().id;
    });
    await act(() => result.current.updateNote(id, { body: "first" }));
    await act(() => result.current.updateNote(id, { body: "second" }));
    expect(cached().find((n) => n.id === id)?.body).toBe("second");
  });

  it("offline at load, waits for the server before deciding what was deleted elsewhere", async () => {
    // Offline, a plain read answers from an empty cache: every note would look
    // deleted on another device, and its queued edit would be dropped.
    recordSyncedIds("notes", EMAIL, ["a"]);
    localStorage.setItem(KEY, JSON.stringify([note("a", { body: "edited offline" })]));
    localStorage.setItem("bookmarkdeck:pending-up:notes:" + EMAIL, JSON.stringify(["a"]));
    vi.mocked(fetchNotes)
      .mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "unavailable" }))
      .mockResolvedValue([note("a")]);

    renderHook(() => useNotes(EMAIL, true));
    await waitFor(() => expect(fetchNotes).toHaveBeenCalledTimes(1));
    expect(saveNote).not.toHaveBeenCalled();
    // Back online (sent until the retry is listening for it).
    await waitFor(() => {
      window.dispatchEvent(new Event("online"));
      expect(subscribeNotes).toHaveBeenCalled();
    });
    expect(saveNote).toHaveBeenCalledWith(EMAIL, expect.objectContaining({ id: "a", body: "edited offline" }));
  });
});
