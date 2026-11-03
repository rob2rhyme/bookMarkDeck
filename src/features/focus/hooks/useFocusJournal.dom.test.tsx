import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Notes pillar queues its offline changes under the "notes" domain. Focus's
// journal used the same name for the same account, so whichever connected first
// cleared the other's queued edits and sent the other's queued deletes to the
// wrong collection.
vi.mock("@/features/focus/data/focusData", () => ({
  addNote: vi.fn(async () => {}),
  deleteNote: vi.fn(async () => {}),
  fetchJournal: vi.fn(async () => []),
  fetchNotes: vi.fn(async () => []),
  saveMood: vi.fn(async () => {}),
  setJournalNote: vi.fn(async () => {}),
  subscribeJournal: vi.fn(() => () => {}),
  subscribeNotes: vi.fn(() => () => {}),
}));

import { addNote, deleteNote, subscribeNotes } from "@/features/focus/data/focusData";
import {
  pendingDeleteIds,
  pendingUpsertIds,
  queueDelete,
  queueUpsert,
} from "@/utils/pendingDeletes";
import { useFocusJournal } from "./useFocusJournal";

const EMAIL = "a@example.com";
const NOTES_KEY = `bookmarkdeck:focus:notes:v1:${EMAIL}`;

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("useFocusJournal's offline queue", () => {
  it("connecting leaves the Notes pillar's queued changes alone", async () => {
    queueUpsert("notes", EMAIL, "notes-pillar-edit");
    queueDelete("notes", EMAIL, "notes-pillar-delete");

    renderHook(() => useFocusJournal(EMAIL, true));
    await waitFor(() => expect(subscribeNotes).toHaveBeenCalled());

    expect(pendingUpsertIds("notes", EMAIL)).toEqual(new Set(["notes-pillar-edit"]));
    expect(pendingDeleteIds("notes", EMAIL)).toEqual(new Set(["notes-pillar-delete"]));
  });

  it("queues its own offline changes where the Notes pillar can't reach them", () => {
    const { result } = renderHook(() => useFocusJournal(EMAIL, false));
    let id = "";
    act(() => result.current.addNote("A thought"));
    act(() => {
      id = result.current.notesByDay[0].notes[0].id;
    });
    expect(pendingUpsertIds("notes", EMAIL).size).toBe(0);
    act(() => result.current.removeNote(id));
    expect(pendingDeleteIds("notes", EMAIL).size).toBe(0);
  });

  it("still delivers a journal change queued under the old shared name", async () => {
    // Queued before the rename: an edit to a note in Focus's cache, and a delete.
    window.localStorage.setItem(
      NOTES_KEY,
      JSON.stringify([{ id: "journal-edit", day: "2026-11-01", text: "Kept", createdAt: null }])
    );
    queueUpsert("notes", EMAIL, "journal-edit");
    queueUpsert("notes", EMAIL, "notes-pillar-edit");
    queueDelete("notes", EMAIL, "journal-delete");

    // Signed in a moment after the page loads, as the app does.
    const { rerender } = renderHook(({ c }) => useFocusJournal(EMAIL, c), {
      initialProps: { c: false },
    });
    rerender({ c: true });
    await waitFor(() => expect(subscribeNotes).toHaveBeenCalled());

    expect(addNote).toHaveBeenCalledWith(EMAIL, expect.objectContaining({ id: "journal-edit" }));
    // A queued delete names no pillar, so both send it to their own collection;
    // a delete of an id a collection doesn't hold does nothing.
    expect(deleteNote).toHaveBeenCalledWith(EMAIL, "journal-delete");
    // The Notes pillar's own entries stay for it.
    expect(pendingUpsertIds("notes", EMAIL)).toEqual(new Set(["notes-pillar-edit"]));
    expect(pendingDeleteIds("notes", EMAIL)).toEqual(new Set(["journal-delete"]));
  });
});
