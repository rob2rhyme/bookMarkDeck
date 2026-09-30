import { afterEach, describe, expect, it, vi } from "vitest";

import { dayKeyFor, dayKeyOf, todayKey } from "@/lib/dayKey";

// CI runs in UTC, where every UTC/local confusion is invisible. Each case pins a
// zone where they differ, and restores it.
const saved = process.env.TZ;
const inZone = (tz: string) => {
  process.env.TZ = tz;
};
afterEach(() => {
  process.env.TZ = saved;
  vi.useRealTimers();
});

describe("dayKeyOf", () => {
  it("returns a bare date unchanged, west of UTC", () => {
    inZone("America/Los_Angeles");
    expect(new Date("2026-09-29").getDate()).toBe(28); // the trap it avoids
    expect(dayKeyOf("2026-09-29")).toBe("2026-09-29");
  });

  it("returns a bare date unchanged, east of UTC", () => {
    inZone("Pacific/Auckland");
    expect(dayKeyOf("2026-09-29")).toBe("2026-09-29");
  });

  it("maps an instant to its local day, west of UTC", () => {
    inZone("America/Los_Angeles");
    expect(dayKeyOf("2026-10-01T03:00:00.000Z")).toBe("2026-09-30"); // 8pm on the 30th
  });

  it("maps an instant to its local day, east of UTC", () => {
    inZone("Pacific/Auckland");
    expect(dayKeyOf("2026-09-30T20:00:00.000Z")).toBe("2026-10-01"); // 9am on the 1st
  });

  it("returns null for something that isn't a date", () => {
    expect(dayKeyOf("soon")).toBeNull();
    expect(dayKeyOf("")).toBeNull();
  });
});

describe("dayKeyFor / todayKey", () => {
  it("use local getters", () => {
    inZone("America/Los_Angeles");
    expect(dayKeyFor(new Date("2026-10-01T03:00:00.000Z"))).toBe("2026-09-30");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T03:00:00.000Z"));
    expect(todayKey()).toBe("2026-09-30");
  });
});
