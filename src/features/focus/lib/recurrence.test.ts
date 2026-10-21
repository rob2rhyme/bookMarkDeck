import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { nextDueAfter, nextOccurrence, priorityRank } from "@/features/focus/lib/recurrence";
import type { Todo } from "@/features/focus/lib/types";

// Recurrence is calendar arithmetic in the viewer's zone, and CI runs in UTC,
// where a UTC date is the local date and every day-boundary bug passes. Pin a
// zone with DST so these exercise the real thing.
let tz: string | undefined;
beforeAll(() => {
  tz = process.env.TZ;
  process.env.TZ = "America/New_York";
});
afterAll(() => {
  if (tz === undefined) delete process.env.TZ;
  else process.env.TZ = tz;
});

const local = (y: number, m: number, d: number, h = 9, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();
const dayOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const hourOf = (iso: string) => new Date(iso).getHours();

describe("nextDueAfter", () => {
  it("daily: the day after the completion day", () => {
    expect(dayOf(nextDueAfter(local(2026, 1, 5), "daily", "2026-01-05"))).toBe("2026-01-06");
  });

  it("finishing early still files the occurrence after the one being done", () => {
    // Due Monday the 12th, finished Friday the 9th: next is the 13th, not the 10th.
    expect(dayOf(nextDueAfter(local(2026, 1, 12), "daily", "2026-01-09"))).toBe("2026-01-13");
  });

  it("finishing late does not queue the missed ones", () => {
    // Due the 5th, finished the 9th: next is the 10th, not the 6th.
    expect(dayOf(nextDueAfter(local(2026, 1, 5), "daily", "2026-01-09"))).toBe("2026-01-10");
  });

  it("weekdays skip the weekend, including from a weekend date", () => {
    expect(dayOf(nextDueAfter(local(2026, 1, 9), "weekdays", "2026-01-09"))).toBe("2026-01-12"); // Fri → Mon
    expect(dayOf(nextDueAfter(local(2026, 1, 10), "weekdays", "2026-01-10"))).toBe("2026-01-12"); // Sat → Mon
  });

  it("weekly keeps the weekday", () => {
    expect(dayOf(nextDueAfter(local(2026, 1, 7), "weekly", "2026-01-07"))).toBe("2026-01-14");
    expect(dayOf(nextDueAfter(local(2026, 1, 7), "weekly", "2026-01-30"))).toBe("2026-02-04");
  });

  it("monthly keeps the day of the month, clamping short months without drifting", () => {
    const jan31 = local(2026, 1, 31);
    const feb = nextDueAfter(jan31, "monthly", "2026-01-31");
    expect(dayOf(feb)).toBe("2026-02-28");
    // From the clamped date the 31st comes back — it is anchored on the original.
    const mar = nextDueAfter(feb, "monthly", "2026-02-28");
    expect(dayOf(mar)).toBe("2026-03-28");
  });

  it("monthly rolls over the year end", () => {
    expect(dayOf(nextDueAfter(local(2026, 12, 15), "monthly", "2026-12-15"))).toBe("2027-01-15");
  });

  it("keeps the time of day across a DST change", () => {
    // New York springs forward on 2026-03-08.
    const next = nextDueAfter(local(2026, 3, 7, 9, 30), "daily", "2026-03-07");
    expect(dayOf(next)).toBe("2026-03-08");
    expect(hourOf(next)).toBe(9);
    expect(new Date(next).getMinutes()).toBe(30);
  });

  it("terminates for a due date years in the past", () => {
    const out = nextDueAfter(local(2012, 1, 1), "daily", "2026-01-09");
    expect(dayOf(out)).toBe("2026-01-10");
  });
});

const todo = (over: Partial<Todo> = {}): Todo => ({
  id: "abc",
  text: "Water the plants",
  note: "",
  done: true,
  dueAt: local(2026, 1, 5),
  createdAt: null,
  completedAt: local(2026, 1, 5, 20),
  day: "2026-01-01",
  list: "personal",
  project: "",
  googleTaskId: "g1",
  googleEventId: "e1",
  repeat: "weekly",
  ...over,
});

describe("nextOccurrence", () => {
  it("files the same to-do, due next time, with a fresh state", () => {
    const next = nextOccurrence(todo(), local(2026, 1, 5, 20))!;
    expect(next).toMatchObject({
      text: "Water the plants",
      done: false,
      completedAt: null,
      repeat: "weekly",
      googleTaskId: null,
      googleEventId: null,
    });
    expect(dayOf(next.dueAt!)).toBe("2026-01-12");
  });

  it("gives the same id to the same completion, and chains from the original id", () => {
    const a = nextOccurrence(todo(), local(2026, 1, 5, 20))!;
    const b = nextOccurrence(todo(), local(2026, 1, 5, 21))!;
    expect(a.id).toBe("abc~2026-01-12");
    expect(b.id).toBe(a.id);
    // Completing the filed one files the next from the same base, not abc~…~….
    const c = nextOccurrence({ ...a, done: true }, local(2026, 1, 12, 9))!;
    expect(c.id).toBe("abc~2026-01-19");
  });

  it("returns null without a repeat or without a due date", () => {
    expect(nextOccurrence(todo({ repeat: undefined }), local(2026, 1, 5))).toBeNull();
    expect(nextOccurrence(todo({ dueAt: null }), local(2026, 1, 5))).toBeNull();
  });

  it("carries priority, project and list, and unticks a checklist note", () => {
    const next = nextOccurrence(
      todo({ priority: "high", list: "project", project: "Garden", note: "- [x] hose\n- can\nplain" }),
      local(2026, 1, 5, 20)
    )!;
    expect(next).toMatchObject({ priority: "high", list: "project", project: "Garden" });
    expect(next.note).toBe("- hose\n- can\nplain");
  });
});

describe("priorityRank", () => {
  it("orders high, normal, low", () => {
    const sorted = [{ priority: "low" as const }, {}, { priority: "high" as const }].sort(
      (a, b) => priorityRank(a) - priorityRank(b)
    );
    expect(sorted.map((t) => (t as { priority?: string }).priority ?? "normal")).toEqual(["high", "normal", "low"]);
  });
});
