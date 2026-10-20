import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  appendDeletion: vi.fn(async () => {}),
  saveDeletions: vi.fn(async () => {}),
  subscribeDeletions: vi.fn(() => () => {}),
  subscribeNotes: vi.fn(() => () => {}),
  fetchVaults: vi.fn(async () => []),
  saveVault: vi.fn(async () => {}),
  subscribeVaults: vi.fn(() => () => {}),
}));
const downloads: { name: string; text: string }[] = [];
vi.mock("@/utils/download", () => ({
  downloadText: (name: string, text: string) => downloads.push({ name, text }),
}));

import type { Note } from "@/features/notes/lib/notes";
import { setNewNoteIntent } from "@/lib/notesIndex";
import { NotesDashboard } from "./NotesDashboard";

const KEY = "bookmarkdeck:notes:v1:a@example.com";
const VAULTS = "bookmarkdeck:notes:vaults:v1:a@example.com";
const note = (id: string, over: Partial<Note> = {}): Note => ({
  id,
  title: id,
  body: `body of ${id}`,
  pinned: false,
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});
const cached = () => JSON.parse(localStorage.getItem(KEY) ?? "[]") as Note[];
const LOCK = { kid: "v1", iv: "aXY=", ct: "Y2lwaGVydGV4dA==" };
const VAULT = {
  id: "v1",
  v: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  pass: { salt: "s", iv: "i", ct: "c", iterations: 600000 },
  recovery: { salt: "s", iv: "i", ct: "c", iterations: 600000 },
};

beforeEach(() => {
  localStorage.clear();
  downloads.length = 0;
  push.mockClear();
});

async function openBackup() {
  render(<NotesDashboard />);
  const btn = await screen.findByRole("button", { name: "Backup" });
  await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(btn);
}

describe("Notes backup", () => {
  it("downloads a restorable backup that keeps locked notes encrypted, and a Markdown export", async () => {
    localStorage.setItem(KEY, JSON.stringify([note("a"), note("b", { title: "Bank", body: "", lock: LOCK })]));
    localStorage.setItem(VAULTS, JSON.stringify([VAULT]));
    await openBackup();
    fireEvent.click(screen.getByRole("button", { name: "Download backup (.json)" }));
    fireEvent.click(screen.getByRole("button", { name: "Export as Markdown (.md)" }));
    const [json, md] = downloads;
    expect(json.name).toMatch(/^bookmarkdeck-notes-\d{4}-\d{2}-\d{2}\.json$/);
    const parsed = JSON.parse(json.text);
    expect(parsed.notes).toHaveLength(2);
    expect(parsed.vaults.map((v: { id: string }) => v.id)).toEqual(["v1"]);
    expect(md.name).toMatch(/\.md$/);
    expect(md.text).toContain("## Bank");
    expect(md.text).not.toContain(LOCK.ct);
  });

  it("restores by merging: adds missing notes, never deletes, and keeps newer local edits", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([note("keep"), note("edited", { body: "newer here", updatedAt: "2026-05-01T00:00:00.000Z" })])
    );
    await openBackup();
    const backup = {
      app: "bookmarkdeck-notes",
      version: 1,
      exportedAt: "2026-02-01T00:00:00.000Z",
      notes: [note("edited", { body: "older in backup" }), note("restored"), note("lockedOne", { body: "", lock: LOCK })],
      vaults: [VAULT],
    };
    const file = new File([JSON.stringify(backup)], "b.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Restore from a backup"), { target: { files: [file] } });
    const summary = await screen.findByText(/Adds 2 notes/);
    expect(summary.textContent).toMatch(/Keeps 1 note that is newer here\. Nothing is deleted\./);
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    const byId = Object.fromEntries(cached().map((n) => [n.id, n]));
    expect(Object.keys(byId).sort()).toEqual(["edited", "keep", "lockedOne", "restored"]);
    expect(byId.edited.body).toBe("newer here");
    expect(byId.lockedOne.lock).toEqual(LOCK);
    expect(JSON.parse(localStorage.getItem(VAULTS) ?? "[]").map((v: { id: string }) => v.id)).toEqual(["v1"]);
  });

  it("says so when a file isn't a backup", async () => {
    await openBackup();
    const file = new File(["{}"], "x.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Restore from a backup"), { target: { files: [file] } });
    expect((await screen.findByRole("alert")).textContent).toMatch(/isn't a Notes backup/);
  });
});

describe("New note from ⌘K", () => {
  it("creates one note once the account's notes have loaded", async () => {
    setNewNoteIntent();
    render(<NotesDashboard />);
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/notes\/[0-9a-f-]{36}$/)));
    expect(cached()).toHaveLength(1);
    expect(localStorage.getItem("bd:intent:new-note")).toBeNull();
  });
});
