import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/focus/data/focusData", () => ({
  fetchHydration: vi.fn(async () => null),
  saveHydration: vi.fn(async () => {}),
  subscribeHydration: vi.fn(() => () => {}),
}));
vi.mock("@/features/focus/lib/sound", () => ({ playChime: vi.fn() }));
vi.mock("@/features/focus/lib/notify", () => ({ notify: vi.fn() }));

import { useHydration } from "./useHydration";

const EMAIL = "a@example.com";
const KEY = `bookmarkdeck:focus:hydration:v1:${EMAIL}`;
const ARGS = { email: EMAIL, enabled: false, intervalMin: 60, goal: 8, soundEnabled: false };
const seed = (rec: object) => localStorage.setItem(KEY, JSON.stringify(rec));
const stored = () => JSON.parse(localStorage.getItem(KEY)!);
const mount = () => renderHook(() => useHydration(ARGS));

// The cache's day used to be a toDateString stamp ("Sun Oct 11 2026") while
// everything else, Focus's own Firestore doc included, keys days as YYYY-MM-DD.
// It is now a day key — but a count saved before the upgrade, or written by a
// tab still running the old bundle, must still read as today's, and the old
// bundle must still be able to read ours, or someone's cups reset to 0.
describe("useHydration — the cache's day", () => {
  const savedTz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "America/Los_Angeles";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 11, 23, 30)); // 23:30 Sun Oct 11 — already Oct 12 in UTC
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = savedTz;
  });

  it("keeps a count saved in the old format", () => {
    seed({ date: "Sun Oct 11 2026", cups: 5, lastDrink: 1 });
    expect(mount().result.current.cups).toBe(5);
  });

  it("keeps the legacy `glasses` field", () => {
    seed({ date: "Sun Oct 11 2026", glasses: 4 });
    expect(mount().result.current.cups).toBe(4);
  });

  it("reads a record stamped with the day key", () => {
    seed({ day: "2026-10-11", cups: 7, lastDrink: 1 });
    expect(mount().result.current.cups).toBe(7);
  });

  it("ignores another day's record", () => {
    seed({ day: "2026-10-10", date: "Sat Oct 10 2026", cups: 3 });
    expect(mount().result.current.cups).toBe(0);
  });

  // Both fields: the day key for this code, and the old stamp so a tab still
  // running the previous bundle reads it as today's instead of resetting to 0.
  it("writes the day key, and the old stamp beside it", () => {
    seed({ date: "Sun Oct 11 2026", cups: 5, lastDrink: 1 });
    const { result } = mount();
    act(() => result.current.drink());
    expect(stored()).toMatchObject({ day: "2026-10-11", date: "Sun Oct 11 2026", cups: 6 });
  });
});
