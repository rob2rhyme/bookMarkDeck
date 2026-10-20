import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { email: "me@example.com" } }, status: "authenticated" }),
}));

import { notesCacheKey } from "@/lib/notesIndex";
import { CommandPalette, OPEN_COMMAND_PALETTE_EVENT } from "./CommandPalette";

const note = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: id,
  body: "",
  pinned: false,
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  push.mockClear();
  localStorage.setItem(
    notesCacheKey("me@example.com"),
    JSON.stringify([
      note("n1", { title: "Cabin trip", body: "wifi password on the fridge" }),
      note("n2", { title: "Bank", body: "", lock: { kid: "v", iv: "i", ct: "c" } }),
    ])
  );
  localStorage.setItem(notesCacheKey("someone@else.com"), JSON.stringify([note("x", { title: "Their secret" })]));
});

function openPalette() {
  render(<CommandPalette />);
  act(() => {
    window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
  });
  return screen.getByRole("textbox", { name: "Search commands" });
}

const rows = () => screen.getAllByRole("button").map((b) => b.textContent ?? "");

describe("CommandPalette — notes", () => {
  it("finds a note by text in its body and opens it", () => {
    const box = openPalette();
    fireEvent.change(box, { target: { value: "fridge" } });
    expect(rows().some((r) => r.includes("Cabin trip"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Cabin trip/ }));
    expect(push).toHaveBeenCalledWith("/notes/n1");
  });

  it("lists a locked note by title, but its body can't be searched", () => {
    const box = openPalette();
    fireEvent.change(box, { target: { value: "bank" } });
    expect(rows().some((r) => r.includes("Bank") && r.includes("Locked note"))).toBe(true);
  });

  it("never shows another account's notes from the same device", () => {
    const box = openPalette();
    fireEvent.change(box, { target: { value: "secret" } });
    expect(rows().some((r) => r.includes("Their secret"))).toBe(false);
  });

  it("'New note' hands off to the Notes page", () => {
    const box = openPalette();
    fireEvent.change(box, { target: { value: "new note" } });
    fireEvent.click(screen.getByRole("button", { name: /New note/ }));
    expect(localStorage.getItem("bd:intent:new-note")).toBe("1");
    expect(push).toHaveBeenCalledWith("/notes");
  });
});

describe("CommandPalette — bookmarks", () => {
  const cache = (bookmarks: { id: string; title: string; url: string }[]) => JSON.stringify({ bookmarks });

  beforeEach(() => {
    localStorage.setItem("bookmarkdeck:v2:me@example.com", cache([{ id: "b1", title: "My bank", url: "https://bank.example" }]));
    // Another account that signed in on this device, and the signed-out cache.
    localStorage.setItem("bookmarkdeck:v2:someone@else.com", cache([{ id: "b2", title: "Their intranet", url: "https://intra.example" }]));
    localStorage.setItem("bookmarkdeck:v2", cache([{ id: "b3", title: "Guest link", url: "https://guest.example" }]));
  });

  it("lists only the signed-in account's bookmarks", () => {
    openPalette();
    const all = rows().join("\n");
    expect(all).toContain("My bank");
    expect(all).not.toContain("Their intranet");
    expect(all).not.toContain("Guest link");
  });

  it("never lists or opens a javascript: or data: bookmark", () => {
    localStorage.setItem(
      "bookmarkdeck:v2:me@example.com",
      cache([
        { id: "x1", title: "Free stuff", url: " JavaScript:alert(1)" },
        { id: "x2", title: "Free page", url: "data:text/html,<script>alert(1)</script>" },
      ])
    );
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const box = openPalette();
    fireEvent.change(box, { target: { value: "free" } });
    expect(rows().some((r) => r.includes("Free"))).toBe(false);
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});
