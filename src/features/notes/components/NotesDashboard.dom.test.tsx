import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
import { NotesDashboard } from "./NotesDashboard";

const KEY = "bookmarkdeck:notes:v1:a@example.com";
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
  window.history.replaceState(null, "", "/notes");
  localStorage.setItem(
    KEY,
    JSON.stringify([
      note("Groceries", { body: "milk\neggs", tags: ["home"], pinned: true }),
      note("Trip", { body: "Book the café near the station", tags: ["travel", "home"] }),
      note("Work log", { body: "standup at 9", tags: ["work"] }),
    ])
  );
});

const titles = () => screen.getAllByRole("listitem").map((li) => within(li).getAllByRole("link")[0].textContent);

describe("NotesDashboard — search", () => {
  it("filters as you type, accent-insensitively, highlighting matches and mirroring ?q=", async () => {
    render(<NotesDashboard />);
    const box = await screen.findByRole("searchbox", { name: "Search notes" });
    fireEvent.change(box, { target: { value: "cafe" } });
    expect(titles()).toEqual(["Trip"]);
    expect(screen.getByRole("status").textContent).toMatch(/1 note/);
    expect(document.querySelector("mark")?.textContent).toBe("café");
    expect(window.location.search).toBe("?q=cafe");
  });

  it("says when nothing matches, and Clear brings everything back", async () => {
    render(<NotesDashboard />);
    fireEvent.change(await screen.findByRole("searchbox"), { target: { value: "zebra" } });
    expect(screen.getByRole("status").textContent).toMatch(/No notes match/);
    fireEvent.click(screen.getAllByRole("button", { name: "Clear search" }).at(-1)!);
    expect(titles()).toHaveLength(3);
    expect(window.location.search).toBe("");
  });

  it("starts from the URL's query and tag", async () => {
    render(<NotesDashboard initialQuery="the" initialTag="home" />);
    await screen.findByRole("searchbox");
    expect(titles()).toEqual(["Trip"]);
  });

  it("'/' focuses search; Esc clears it", async () => {
    render(<NotesDashboard />);
    const box = await screen.findByRole("searchbox");
    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(box);
    fireEvent.change(box, { target: { value: "milk" } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect((box as HTMLInputElement).value).toBe("");
  });
});

describe("NotesDashboard — tags", () => {
  it("lists tags by use and filters by one, from the row or from a card", async () => {
    render(<NotesDashboard />);
    const row = await screen.findByRole("group", { name: "Filter by tag" });
    expect(within(row).getAllByRole("button").map((b) => b.textContent)).toEqual(["All", "#home 2", "#travel 1", "#work 1"]);
    fireEvent.click(within(row).getByRole("button", { name: /#work/ }));
    expect(titles()).toEqual(["Work log"]);
    expect(window.location.search).toBe("?tag=work");
    fireEvent.click(within(row).getByRole("button", { name: "All" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Show notes tagged travel" })[0]);
    expect(titles()).toEqual(["Trip"]);
  });

  it("renames a tag on every note", async () => {
    render(<NotesDashboard initialTag="home" />);
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText(/Rename #home to/), { target: { value: "House" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    expect(cached().filter((n) => n.tags.includes("house")).map((n) => n.id).sort()).toEqual(["Groceries", "Trip"]);
    expect(window.location.search).toBe("?tag=house");
  });

  it("deletes a tag only after confirming, keeping the notes", async () => {
    render(<NotesDashboard initialTag="home" />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete tag" }));
    expect(cached().filter((n) => n.tags.includes("home"))).toHaveLength(2);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Remove tag" }));
    });
    expect(cached()).toHaveLength(3);
    expect(cached().some((n) => n.tags.includes("home"))).toBe(false);
  });
});
