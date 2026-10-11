import { afterEach, describe, expect, it, vi } from "vitest";

import { hydrationCacheKey, readHydrationCache, writeHydrationCache } from "./focusHydrationCache";

const EMAIL = "a@example.com";
const store = (rec: object, email: string | null = EMAIL) =>
  localStorage.setItem(hydrationCacheKey(email), JSON.stringify(rec));
const stored = (email: string | null = EMAIL) =>
  JSON.parse(localStorage.getItem(hydrationCacheKey(email))!);

const savedTz = process.env.TZ;
/** Pin a zone and put the clock at local noon on `day` there. */
function at(tz: string, day: string) {
  process.env.TZ = tz;
  const [y, m, d] = day.split("-").map(Number);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(y, m - 1, d, 12));
  localStorage.clear();
}
afterEach(() => {
  vi.useRealTimers();
  process.env.TZ = savedTz;
});

describe("readHydrationCache", () => {
  it("matches a day-key record only for its own day", () => {
    at("America/New_York", "2026-03-15");
    store({ day: "2026-03-15", cups: 3 });
    expect(readHydrationCache(EMAIL, "2026-03-15")).toEqual({ cups: 3, lastDrink: null });
    expect(readHydrationCache(EMAIL, "2026-03-14")).toBeNull();
  });

  it("matches a pre-upgrade record by its old stamp, only for its own day", () => {
    at("America/New_York", "2026-03-15");
    store({ date: "Sun Mar 15 2026", cups: 2, lastDrink: 5 });
    expect(readHydrationCache(EMAIL, "2026-03-15")).toEqual({ cups: 2, lastDrink: 5 });
    expect(readHydrationCache(EMAIL, "2026-03-16")).toBeNull();
  });

  it("reads the oldest records' `glasses`, and rounds what it reads", () => {
    at("America/New_York", "2026-03-15");
    store({ date: "Sun Mar 15 2026", glasses: 4 });
    expect(readHydrationCache(EMAIL, "2026-03-15")?.cups).toBe(4);
    store({ day: "2026-03-15", cups: 2.6 });
    expect(readHydrationCache(EMAIL, "2026-03-15")?.cups).toBe(3);
  });

  it("keeps the signed-out cache apart from an account's", () => {
    at("America/New_York", "2026-03-15");
    store({ day: "2026-03-15", cups: 1 }, null);
    expect(readHydrationCache(null, "2026-03-15")?.cups).toBe(1);
    expect(readHydrationCache(EMAIL, "2026-03-15")).toBeNull();
  });

  it("returns null for junk instead of throwing", () => {
    at("America/New_York", "2026-03-15");
    localStorage.setItem(hydrationCacheKey(EMAIL), "{not json");
    expect(readHydrationCache(EMAIL, "2026-03-15")).toBeNull();
    localStorage.setItem(hydrationCacheKey(EMAIL), "7");
    expect(readHydrationCache(EMAIL, "2026-03-15")).toBeNull();
  });
});

describe("writeHydrationCache", () => {
  it("writes the day key and the old stamp, so the previous bundle reads it too", () => {
    at("America/Los_Angeles", "2026-10-11");
    expect(writeHydrationCache(EMAIL, "2026-10-11", 6, 99)).toBe(true);
    expect(stored()).toEqual({
      day: "2026-10-11",
      date: new Date().toDateString(), // exactly what the old reader compares with
      cups: 6,
      lastDrink: 99,
    });
  });

  it("drops a write for any day but today, leaving today's record alone", () => {
    at("America/New_York", "2026-03-15");
    store({ day: "2026-03-15", cups: 2 });
    expect(writeHydrationCache(EMAIL, "2026-03-14", 9)).toBe(false);
    expect(stored().cups).toBe(2);
  });

  it("moves the last drink only when the count rises", () => {
    at("America/New_York", "2026-03-15");
    store({ day: "2026-03-15", cups: 3, lastDrink: 111 });
    writeHydrationCache(EMAIL, "2026-03-15", 2);
    expect(stored().lastDrink).toBe(111);
    writeHydrationCache(EMAIL, "2026-03-15", 0);
    expect(stored().lastDrink).toBe(111);
    writeHydrationCache(EMAIL, "2026-03-15", 1);
    expect(stored().lastDrink).toBe(Date.now());
  });

  // The old stamp is built from the day's parts. On these days local midnight
  // does not exist (the clocks jump 00:00 → 01:00), so the build must not land
  // on the previous day — or the old bundle would miss today's record.
  it.each([
    ["America/Santiago", "2026-09-06"],
    ["America/Havana", "2026-03-08"],
    ["Pacific/Kiritimati", "2026-10-11"],
    ["Pacific/Pago_Pago", "2026-10-11"],
  ])("stamps the right day in %s on %s", (tz, day) => {
    at(tz, day);
    writeHydrationCache(EMAIL, day, 1);
    expect(stored().date).toBe(new Date().toDateString());
    expect(readHydrationCache(EMAIL, day)?.cups).toBe(1);
  });
});
