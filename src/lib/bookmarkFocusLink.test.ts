import { describe, expect, it } from "vitest";

import {
  hasReconcilableBlock,
  type BookmarkFocusLink,
} from "@/lib/bookmarkFocusLink";

const TODAY = "2026-06-26";
const link = (over: Partial<BookmarkFocusLink> = {}): BookmarkFocusLink => ({
  bookmarkId: "b1",
  title: "Docs",
  at: "2026-06-26T10:00:00.000Z",
  day: TODAY,
  ...over,
});

const session = (day: string, createdAt: string | null) => ({ day, createdAt });

describe("hasReconcilableBlock", () => {
  it("matches a block completed today after the link", () => {
    const sessions = [session(TODAY, "2026-06-26T10:30:00.000Z")];
    expect(hasReconcilableBlock(link(), sessions, TODAY)).toBe(true);
  });

  it("ignores a block completed before the link was set (a mere click)", () => {
    const sessions = [session(TODAY, "2026-06-26T09:30:00.000Z")];
    expect(hasReconcilableBlock(link(), sessions, TODAY)).toBe(false);
  });

  it("ignores blocks from other days", () => {
    const sessions = [session("2026-06-25", "2026-06-25T23:59:00.000Z")];
    expect(hasReconcilableBlock(link(), sessions, TODAY)).toBe(false);
  });

  it("returns false when the link is from a previous day (stale)", () => {
    const sessions = [session(TODAY, "2026-06-26T10:30:00.000Z")];
    expect(hasReconcilableBlock(link({ day: "2026-06-25" }), sessions, TODAY)).toBe(
      false
    );
  });

  it("treats a missing createdAt as not-after the link", () => {
    const sessions = [session(TODAY, null)];
    expect(hasReconcilableBlock(link(), sessions, TODAY)).toBe(false);
  });

  it("returns false with no sessions", () => {
    expect(hasReconcilableBlock(link(), [], TODAY)).toBe(false);
  });

  it("matches when a completion equals the link timestamp exactly", () => {
    const sessions = [session(TODAY, "2026-06-26T10:00:00.000Z")];
    expect(hasReconcilableBlock(link(), sessions, TODAY)).toBe(true);
  });
});
