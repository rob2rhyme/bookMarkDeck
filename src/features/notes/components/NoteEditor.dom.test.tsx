import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { email: "a@example.com" } }, status: "authenticated" }),
}));
vi.mock("firebase/auth", () => ({ onAuthStateChanged: () => () => {} }));
vi.mock("@/lib/firebase", () => ({ auth: {}, ensureFirebaseGoogleAuth: vi.fn() }));
vi.mock("@/features/notes/data/notesData", () => ({
  deleteNote: vi.fn(async () => {}),
  fetchNotes: vi.fn(async () => []),
  saveNote: vi.fn(async () => {}),
  subscribeNotes: vi.fn(() => () => {}),
}));

import type { Note } from "@/features/notes/lib/notes";
import { NoteEditorScreen } from "./NoteEditor";

const KEY = "bookmarkdeck:notes:v1:a@example.com";
const note = (over: Partial<Note> = {}): Note => ({
  id: "n1",
  title: "Groceries",
  body: "- milk",
  pinned: false,
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});
const cached = () => JSON.parse(localStorage.getItem(KEY) ?? "[]") as Note[];

beforeEach(() => {
  localStorage.clear();
  push.mockClear();
});

async function open(n: Note | null = note()) {
  if (n) localStorage.setItem(KEY, JSON.stringify([n]));
  const view = render(<NoteEditorScreen id="n1" />);
  const body = n ? ((await screen.findByLabelText("Note")) as HTMLTextAreaElement) : null;
  return { ...view, body };
}

describe("NoteEditor", () => {
  it("continues a list on Enter", async () => {
    const { body } = await open();
    body!.setSelectionRange(6, 6);
    fireEvent.keyDown(body!, { key: "Enter" });
    expect(body!.value).toBe("- milk\n- ");
  });

  it("autosaves ~800 ms after typing stops, and says so", async () => {
    const { body } = await open();
    fireEvent.change(body!, { target: { value: "- milk\n- eggs" } });
    expect(screen.getByRole("status").textContent).toMatch(/Saving/);
    expect(cached()[0].body).toBe("- milk");
    await waitFor(() => expect(cached()[0].body).toBe("- milk\n- eggs"), { timeout: 2000 });
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Saved on this device/));
  });

  it("deletes only after confirming", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    expect(cached()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(cached()).toHaveLength(0);
    expect(push).toHaveBeenCalledWith("/notes");
  });

  it("discards a note left blank when the editor closes", async () => {
    const { unmount } = await open(note({ title: "", body: "" }));
    unmount();
    await waitFor(() => expect(cached()).toHaveLength(0));
  });

  it("keeps a note that has content when the editor closes", async () => {
    const { unmount } = await open();
    unmount();
    await new Promise((r) => setTimeout(r, 10));
    expect(cached()).toHaveLength(1);
  });

  it("adopts a change from another tab while nothing is unsaved", async () => {
    const { body } = await open();
    localStorage.setItem(KEY, JSON.stringify([note({ body: "- milk\n- from my phone" })]));
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: KEY, storageArea: localStorage }));
    });
    expect(body!.value).toBe("- milk\n- from my phone");
  });

  it("saves a tag at once, without waiting for the autosave", async () => {
    await open();
    const tagBox = screen.getByRole("combobox", { name: "Add tag" });
    fireEvent.change(tagBox, { target: { value: "Errands" } });
    fireEvent.keyDown(tagBox, { key: "Enter" });
    expect(cached()[0].tags).toEqual(["errands"]);
    expect(cached()[0].updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("Esc in the tag box clears it instead of leaving the note", async () => {
    await open();
    const tagBox = screen.getByRole("combobox", { name: "Add tag" });
    tagBox.focus();
    fireEvent.change(tagBox, { target: { value: "half" } });
    fireEvent.keyDown(tagBox, { key: "Escape" });
    expect(push).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(push).toHaveBeenCalledWith("/notes");
  });

  it("⌘B wraps the selection in bold; the toolbar does the same", async () => {
    const { body } = await open(note({ body: "buy milk" }));
    body!.setSelectionRange(4, 8);
    fireEvent.keyDown(body!, { key: "b", metaKey: true });
    expect(body!.value).toBe("buy **milk**");
    body!.setSelectionRange(0, 3);
    fireEvent.click(screen.getByRole("button", { name: "Italic" }));
    expect(body!.value).toBe("*buy* **milk**");
  });

  it("previews markdown, and ticking a box edits and saves the text", async () => {
    await open(note({ body: "# Shop\n- [ ] milk" }));
    fireEvent.click(screen.getByRole("button", { name: "preview" }));
    expect(screen.getByRole("heading", { name: "Shop" })).toBeTruthy();
    expect(screen.queryByLabelText("Note")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark as done" }));
    await waitFor(() => expect(cached()[0].body).toBe("# Shop\n- [x] milk"), { timeout: 2000 });
  });

  it("remembers the view per device, but a blank note opens in Edit", async () => {
    const first = await open();
    fireEvent.keyDown(window, { key: "e", metaKey: true });
    expect(screen.queryByLabelText("Note")).toBeNull();
    expect(localStorage.getItem("bd:notes:view:v1")).toBe("preview");
    first.unmount();
    render(<NoteEditorScreen id="n1" />);
    const toggle = await screen.findByRole("button", { name: "preview" });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("a blank note opens in Edit even when Preview is remembered", async () => {
    localStorage.setItem("bd:notes:view:v1", "preview");
    const { body } = await open(note({ title: "", body: "" }));
    expect(body).toBeTruthy();
  });

  it("says when a note doesn't exist", async () => {
    await open(null);
    expect(await screen.findByText(/doesn.t exist/)).toBeTruthy();
  });
});
