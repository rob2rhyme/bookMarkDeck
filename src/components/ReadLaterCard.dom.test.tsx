import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/utils/readerClient", () => ({
  fetchArticle: vi.fn(async () => ({ article: null })),
}));

import { ReadLaterCard } from "@/components/ReadLaterCard";
import type { Bookmark } from "@/types/bookmark";

const bm = (id: string, over: Partial<Bookmark> = {}): Bookmark => ({
  id,
  title: `Title ${id}`,
  url: `https://${id}.example.com/post`,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

type Update = (id: string, patch: Partial<Bookmark>) => void;
let onUpdate: ReturnType<typeof vi.fn<Update>>;
beforeEach(() => {
  onUpdate = vi.fn<Update>();
});

describe("ReadLaterCard", () => {
  it("renders nothing when nothing is queued", () => {
    const { container } = render(<ReadLaterCard bookmarks={[bm("a"), bm("b", { readLaterAt: iso(3), readAt: iso(1) })]} onUpdate={onUpdate} />);
    expect(container.textContent).toBe("");
  });

  it("lists the queue oldest first, with the count and how long each has waited", () => {
    render(
      <ReadLaterCard
        bookmarks={[bm("new", { readLaterAt: iso(1) }), bm("old", { readLaterAt: iso(20) }), bm("none")]}
        onUpdate={onUpdate}
      />
    );
    const card = screen.getByRole("region", { name: "Read later" });
    expect(card.textContent).toContain("Read later · 2");
    const rows = within(card).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Title old"),
      expect.stringContaining("Title new"),
    ]);
    expect(rows[0].textContent).toContain("old.example.com");
    expect(rows[0].textContent).toContain("waiting 2 weeks");
  });

  it("marks one read, or removes it, through the bookmark's own timestamps", () => {
    render(<ReadLaterCard bookmarks={[bm("a", { readLaterAt: iso(2) })]} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark Title a as read" }));
    expect(onUpdate.mock.calls[0][0]).toBe("a");
    expect(typeof onUpdate.mock.calls[0][1].readAt).toBe("string");
    fireEvent.click(screen.getByRole("button", { name: "Remove Title a from the queue" }));
    expect(onUpdate.mock.calls[1]).toEqual(["a", { readLaterAt: undefined, readAt: undefined }]);
  });

  it("shows five and the rest on request", () => {
    const many = Array.from({ length: 8 }, (_, i) => bm(`n${i}`, { readLaterAt: iso(10 - i) }));
    render(<ReadLaterCard bookmarks={many} onUpdate={onUpdate} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Show all 8" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("Read opens the reader on that bookmark, and marking it read there leaves it open", () => {
    const { rerender } = render(<ReadLaterCard bookmarks={[bm("a", { readLaterAt: iso(2) })]} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole("button", { name: "Read Title a" }));
    const dialog = screen.getByRole("dialog", { name: "Title a" });
    expect(dialog).toBeTruthy();
    // It's marked read (the parent updates the bookmark): out of the queue, dialog stays.
    rerender(<ReadLaterCard bookmarks={[bm("a", { readLaterAt: iso(2), readAt: iso(0) })]} onUpdate={onUpdate} />);
    expect(screen.getByRole("dialog", { name: "Title a" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Read later" })).toBeNull();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
