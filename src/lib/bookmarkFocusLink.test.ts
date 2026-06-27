import { describe, expect, it } from "vitest";

import {
  bookmarkForDay,
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

describe("bookmarkForDay", () => {
  it("attributes a block completing on the link's day", () => {
    expect(bookmarkForDay(link(), TODAY)).toEqual({ id: "b1", title: "Docs" });
  });

  it("does not attribute a stale link from a previous day", () => {
    expect(bookmarkForDay(link({ day: "2026-06-25" }), TODAY)).toBeNull();
  });

  it("returns null when there is no link", () => {
    expect(bookmarkForDay(null, TODAY)).toBeNull();
  });

  it("carries the title snapshot through verbatim", () => {
    expect(bookmarkForDay(link({ title: "MDN" }), TODAY)).toEqual({
      id: "b1",
      title: "MDN",
    });
  });
});
