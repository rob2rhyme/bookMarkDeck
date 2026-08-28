import { describe, expect, it } from "vitest";

import { buildDigest, msUntilHour } from "@/features/filing/lib/digest";
import type { DueItem } from "@/features/filing/lib/obligations";
import type { ShredItem } from "@/features/filing/lib/retention";
import type { CustodyItem } from "@/features/filing/lib/custody";

const due = (over: Partial<DueItem> & { title?: string; label?: string } = {}): DueItem =>
  ({
    document: { id: "d", title: over.title ?? "Paper" },
    obligation: { id: "o", label: over.label },
    bucket: over.bucket ?? "overdue",
    daysAway: over.daysAway ?? -1,
  }) as DueItem;

const shred = (): ShredItem => ({}) as ShredItem;
const held = (overdue: boolean): CustodyItem => ({ overdue }) as CustodyItem;

describe("buildDigest", () => {
  it("sends nothing when there is nothing", () => {
    const d = buildDigest([], [], []);
    expect(d.count).toBe(0);
    expect(d.title).toBe("");
  });

  it("leads with overdue, because that's the fact worth a lock screen", () => {
    const d = buildDigest([due({ title: "Registration" })], [], []);
    expect(d.title).toBe("1 paper overdue");
    expect(d.body).toBe("Registration");
  });

  it("pluralises", () => {
    const d = buildDigest([due({ title: "A" }), due({ title: "B" })], [], []);
    expect(d.title).toBe("2 papers overdue");
    expect(d.body).toBe("A and B");
  });

  it("prefers the obligation's own label over the paper title", () => {
    expect(buildDigest([due({ title: "Auto policy", label: "Premium" })], [], []).body).toBe("Premium");
  });

  it("falls back to due-this-week when nothing is overdue", () => {
    const d = buildDigest([due({ bucket: "week", daysAway: 3, title: "Passport" })], [], []);
    expect(d.title).toBe("1 paper due this week");
  });

  it("names at most three, then counts the rest", () => {
    const items = ["A", "B", "C", "D", "E"].map((t) => due({ title: t }));
    expect(buildDigest(items, [], []).body).toBe("A, B, C and 2 more");
  });

  it("counts rather than names when everything is further out", () => {
    const d = buildDigest([due({ bucket: "month", daysAway: 20 })], [], []);
    expect(d.title).toBe("Filing needs a look");
    expect(d.body).toBe("1 reminder coming up");
  });

  it("mentions papers ready to clear", () => {
    const d = buildDigest([], [shred(), shred()], []);
    expect(d.count).toBe(2);
    expect(d.body).toBe("2 papers ready to clear");
  });

  it("mentions folders somebody hasn't brought back", () => {
    const d = buildDigest([], [], [held(true)]);
    expect(d.title).toBe("1 folder not back yet");
    expect(d.body).toBe("1 folder still out");
  });

  it("ignores folders that are out but not yet late", () => {
    expect(buildDigest([], [], [held(false)]).count).toBe(0);
  });

  it("joins all three kinds into one line", () => {
    const d = buildDigest([due({ title: "Tax" })], [shred()], [held(true)]);
    expect(d.title).toBe("1 paper overdue");
    expect(d.body).toBe("Tax, 1 paper ready to clear and 1 folder still out");
    expect(d.count).toBe(3);
  });
});

describe("msUntilHour", () => {
  const at = (h: number, m = 0) => new Date(2026, 7, 28, h, m, 0, 0);

  it("counts forward to today's hour", () => {
    expect(msUntilHour(at(6), 9)).toBe(3 * 3600_000);
  });

  it("rolls to tomorrow once the hour has passed", () => {
    expect(msUntilHour(at(10), 9)).toBe(23 * 3600_000);
  });

  it("rolls to tomorrow AT the hour, so re-arming can't schedule the past", () => {
    // The digest fires at 09:00 and the app re-arms at 09:00 — this must be
    // tomorrow, not 0ms, or the notification repeats immediately.
    expect(msUntilHour(at(9), 9)).toBe(24 * 3600_000);
  });

  it("is always strictly positive", () => {
    for (let h = 0; h < 24; h++) {
      for (const target of [0, 9, 23]) {
        expect(msUntilHour(at(h, 30), target)).toBeGreaterThan(0);
      }
    }
  });
});
