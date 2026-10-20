import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/notes/data/notesData", () => ({
  deleteNote: vi.fn(async () => {}),
  fetchNotes: vi.fn(async () => []),
  saveNote: vi.fn(async () => {}),
  subscribeNotes: vi.fn(() => () => {}),
}));

import { deleteNote, fetchNotes, saveNote, subscribeNotes } from "@/features/notes/data/notesData";
import type { Note } from "@/features/notes/lib/notes";
import { recordSyncedIds } from "@/utils/syncedIds";
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
  vi.mocked(saveNote).mockClear();
  vi.mocked(deleteNote).mockClear();
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
      push = cb;
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
