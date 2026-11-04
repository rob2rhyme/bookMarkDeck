import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  cleanReadLater,
  dequeuePatch,
  isQueued,
  isRead,
  queuePatch,
  readPatch,
  readingQueue,
  waitingLabel,
} from "@/utils/readLater";

const b = (id: string, over: { readLaterAt?: string; readAt?: string } = {}) => ({ id, ...over });

describe("state", () => {
  it("queued means queued and not finished; read means finished, queued or not", () => {
    expect(isQueued(b("a"))).toBe(false);
    expect(isQueued(b("a", { readLaterAt: "2026-01-01T00:00:00Z" }))).toBe(true);
    expect(isQueued(b("a", { readLaterAt: "2026-01-01T00:00:00Z", readAt: "2026-01-02T00:00:00Z" }))).toBe(false);
    expect(isRead(b("a", { readAt: "2026-01-02T00:00:00Z" }))).toBe(true);
    expect(isRead(b("a", { readLaterAt: "2026-01-01T00:00:00Z" }))).toBe(false);
  });

  it("the patches move a bookmark through queue → read → queued again → out", () => {
    const now = "2026-02-01T09:00:00.000Z";
    let s: { readLaterAt?: string; readAt?: string } = {};
    s = { ...s, ...queuePatch(now) };
    expect(isQueued(s)).toBe(true);
    s = { ...s, ...readPatch("2026-02-02T09:00:00.000Z") };
    expect(isRead(s) && !isQueued(s)).toBe(true);
    s = { ...s, ...queuePatch("2026-02-03T09:00:00.000Z") }; // queue it again: no longer "read"
    expect(isQueued(s)).toBe(true);
    expect(s.readAt).toBeUndefined();
    s = { ...s, ...dequeuePatch() };
    expect(s.readLaterAt).toBeUndefined();
    expect(isQueued(s) || isRead(s)).toBe(false);
  });
});

describe("readingQueue", () => {
  it("is the queued ones only, oldest first, ties by id", () => {
    const list = [
      b("c", { readLaterAt: "2026-03-01T00:00:00Z" }),
      b("a", { readLaterAt: "2026-01-01T00:00:00Z" }),
      b("done", { readLaterAt: "2026-01-02T00:00:00Z", readAt: "2026-01-05T00:00:00Z" }),
      b("none"),
      b("b", { readLaterAt: "2026-01-01T00:00:00Z" }),
    ];
    expect(readingQueue(list).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("doesn't reorder the list it was given", () => {
    const list = [b("z", { readLaterAt: "2026-05-01T00:00:00Z" }), b("y", { readLaterAt: "2026-01-01T00:00:00Z" })];
    const copy = [...list];
    readingQueue(list);
    expect(list).toEqual(copy);
  });
});

describe("waitingLabel (local days)", () => {
  const prevTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Los_Angeles";
  });
  afterAll(() => {
    process.env.TZ = prevTz;
  });
  const now = new Date(2026, 10, 3, 14, 0, 0); // 3 Nov 14:00 local

  it("says today, yesterday, days, weeks, months", () => {
    expect(waitingLabel(new Date(2026, 10, 3, 1, 0).toISOString(), now)).toBe("today");
    expect(waitingLabel(new Date(2026, 10, 2, 23, 0).toISOString(), now)).toBe("yesterday");
    expect(waitingLabel(new Date(2026, 10, 1, 9, 0).toISOString(), now)).toBe("2 days");
    expect(waitingLabel(new Date(2026, 9, 13, 9, 0).toISOString(), now)).toBe("3 weeks");
    expect(waitingLabel(new Date(2026, 7, 3, 9, 0).toISOString(), now)).toBe("3 months");
  });

  it("counts calendar days in the local zone, not 24-hour spans of the UTC instant", () => {
    // 11 pm last night and 1 am today are two hours apart but one day apart.
    expect(waitingLabel(new Date(2026, 10, 2, 23, 30).toISOString(), new Date(2026, 10, 3, 1, 30))).toBe("yesterday");
  });

  it("is blank for something that isn't a date, and never negative", () => {
    expect(waitingLabel("nope", now)).toBe("");
    expect(waitingLabel(new Date(2026, 10, 9).toISOString(), now)).toBe("today");
  });
});

describe("cleanReadLater", () => {
  it("keeps valid instants and drops the rest", () => {
    expect(cleanReadLater({ readLaterAt: "2026-01-01T00:00:00Z", readAt: "2026-01-02T00:00:00Z" })).toEqual({
      readLaterAt: "2026-01-01T00:00:00Z",
      readAt: "2026-01-02T00:00:00Z",
    });
    expect(cleanReadLater({ readLaterAt: "not a date", readAt: 5 })).toEqual({});
    expect(cleanReadLater({ readLaterAt: "  " })).toEqual({});
    expect(cleanReadLater({})).toEqual({});
  });
});
