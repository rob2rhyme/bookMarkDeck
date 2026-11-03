import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Signed in, so every save goes to Firestore — and offline its promise never
// settles. The editor runs saves one after another, and each used to wait for the
// cloud: after the first offline autosave nothing else was saved, not even to the
// device, and the status said "Saving…" for good.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { email: "a@example.com" } }, status: "authenticated" }),
}));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => {
    cb({ uid: "u1" });
    return () => {};
  },
}));
vi.mock("@/lib/firebase", () => ({ auth: {}, ensureFirebaseGoogleAuth: vi.fn() }));
vi.mock("@/features/notes/data/notesData", () => ({
  deleteNote: vi.fn(() => new Promise(() => {})),
  fetchNotes: vi.fn(async () => []),
  saveNote: vi.fn(() => new Promise(() => {})),
  appendDeletion: vi.fn(() => new Promise(() => {})),
  saveDeletions: vi.fn(() => new Promise(() => {})),
  subscribeDeletions: vi.fn(() => () => {}),
  subscribeNotes: vi.fn(() => () => {}),
  subscribeVaults: vi.fn(() => () => {}),
  fetchVaults: vi.fn(async () => []),
  saveVault: vi.fn(() => new Promise(() => {})),
}));

import { saveNote } from "@/features/notes/data/notesData";
import type { Note } from "@/features/notes/lib/notes";
import { NoteEditorScreen } from "./NoteEditor";

const KEY = "bookmarkdeck:notes:v1:a@example.com";
const NOTE: Note = {
  id: "n1",
  title: "Groceries",
  body: "- milk",
  pinned: false,
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const cached = () => JSON.parse(localStorage.getItem(KEY) ?? "[]") as Note[];

beforeEach(() => localStorage.clear());

describe("NoteEditor — signed in, offline", () => {
  it("keeps saving to the device while the cloud doesn't answer", async () => {
    localStorage.setItem(KEY, JSON.stringify([NOTE]));
    render(<NoteEditorScreen id="n1" />);
    const body = (await screen.findByLabelText("Note")) as HTMLTextAreaElement;

    fireEvent.change(body, { target: { value: "- milk\n- eggs" } });
    await waitFor(() => expect(cached()[0].body).toBe("- milk\n- eggs"), { timeout: 2000 });
    await waitFor(() => expect(saveNote).toHaveBeenCalled());

    fireEvent.change(body, { target: { value: "- milk\n- eggs\n- bread" } });
    await waitFor(() => expect(cached()[0].body).toBe("- milk\n- eggs\n- bread"), { timeout: 2000 });
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Saved/));
  });
});
