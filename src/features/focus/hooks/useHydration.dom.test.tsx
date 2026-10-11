import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory focusHydration collection: one count per day, live listeners
// per day, and a write echoed to that day's listeners — enough to replay
// another device writing while this tab sleeps.
const cloud = vi.hoisted(() => {
  const days = new Map<string, number>();
  const listeners = new Map<string, Set<(v: number | null) => void>>();
  const emit = (day: string) =>
    listeners.get(day)?.forEach((cb) => cb(days.has(day) ? days.get(day)! : null));
  return {
    days,
    subscribedDays: [] as string[],
    reset() {
      days.clear();
      listeners.clear();
      this.subscribedDays.length = 0;
    },
    /** Another device writes `day`'s count. */
    write(day: string, cups: number) {
      days.set(day, cups);
      emit(day);
    },
    /** A snapshot of `day` arriving, whatever the store holds. */
    snapshot(day: string, cups: number | null) {
      listeners.get(day)?.forEach((cb) => cb(cups));
    },
    listen(day: string, cb: (v: number | null) => void) {
      this.subscribedDays.push(day);
      if (!listeners.has(day)) listeners.set(day, new Set());
      listeners.get(day)!.add(cb);
      // Firestore delivers the first snapshot asynchronously.
      Promise.resolve().then(() => {
        if (listeners.get(day)?.has(cb)) cb(days.has(day) ? days.get(day)! : null);
      });
      return () => listeners.get(day)?.delete(cb);
    },
  };
});

vi.mock("@/features/focus/data/focusData", () => ({
  fetchHydration: vi.fn(async (_e: string, day: string) => cloud.days.get(day) ?? null),
  saveHydration: vi.fn(async (_e: string, day: string, cups: number) => cloud.write(day, cups)),
  subscribeHydration: vi.fn((_e: string, day: string, cb: (v: number | null) => void) =>
    cloud.listen(day, cb)
  ),
}));
vi.mock("@/features/focus/lib/sound", () => ({ playChime: vi.fn() }));
vi.mock("@/features/focus/lib/notify", () => ({ notify: vi.fn() }));

import { saveHydration } from "@/features/focus/data/focusData";
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

// Focus's day used to roll over only inside the reminder loop, and the live
// record it followed was the day it mounted on. So: with reminders off, a tab
// left open overnight carried yesterday's count into today; a laptop waking
// with Focus open wrote 0 over the cups the phone had logged that morning; and
// after midnight the tab never saw today's record from another device. Each
// test replays one of those on a pinned zone and clock.
describe("useHydration — across midnight", () => {
  const savedTz = process.env.TZ;
  const synced = { ...ARGS, connected: true };
  const flush = () => act(async () => {});
  const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

  beforeEach(() => {
    process.env.TZ = "America/New_York";
    vi.useFakeTimers();
    localStorage.clear();
    cloud.reset();
    vi.mocked(saveHydration).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = savedTz;
  });

  it("starts the new day at 0 with reminders off, instead of carrying yesterday's count", () => {
    vi.setSystemTime(new Date(2026, 2, 10, 23, 50));
    seed({ day: "2026-03-10", cups: 5 });
    const { result } = mount();
    expect(result.current.cups).toBe(5);
    tick(20 * 60_000); // 00:10, Mar 11
    expect(result.current.cups).toBe(0);
    act(() => result.current.drink());
    expect(result.current.cups).toBe(1);
    expect(stored()).toMatchObject({ day: "2026-03-11", cups: 1 });
  });

  it("rolls over on the first drink after midnight, even before the clock has ticked", () => {
    vi.setSystemTime(new Date(2026, 2, 10, 23, 50));
    seed({ day: "2026-03-10", cups: 5 });
    const { result } = mount();
    vi.setSystemTime(new Date(2026, 2, 11, 0, 40));
    act(() => result.current.drink());
    expect(result.current.cups).toBe(1);
  });

  it("never writes 0 over the cups another device logged while this tab slept", async () => {
    vi.setSystemTime(new Date(2026, 9, 10, 22, 0));
    const { result } = renderHook(() => useHydration({ ...synced, enabled: true }));
    await flush();
    act(() => result.current.drink());
    act(() => result.current.drink());
    expect(cloud.days.get("2026-10-10")).toBe(2);

    // The laptop sleeps — its timers don't run — and the phone logs 3 cups.
    vi.setSystemTime(new Date(2026, 9, 11, 8, 0));
    act(() => cloud.write("2026-10-11", 3));
    tick(15_000); // it wakes
    await flush();
    expect(saveHydration).not.toHaveBeenCalledWith(EMAIL, "2026-10-11", 0);
    expect(cloud.days.get("2026-10-11")).toBe(3);
    expect(result.current.cups).toBe(3);

    // …and the two stay in step from then on.
    act(() => cloud.write("2026-10-11", 4));
    expect(result.current.cups).toBe(4);
    act(() => result.current.drink());
    expect(cloud.days.get("2026-10-11")).toBe(5);
  });

  it("follows today's record after midnight, and ignores yesterday's", async () => {
    vi.setSystemTime(new Date(2026, 9, 10, 23, 59, 30));
    cloud.write("2026-10-10", 5);
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    expect(result.current.cups).toBe(5);
    tick(60_000);
    await flush();
    expect(cloud.subscribedDays).toContain("2026-10-11");
    expect(result.current.cups).toBe(0);
    act(() => cloud.snapshot("2026-10-10", 6)); // a late change to yesterday
    expect(result.current.cups).toBe(0);
    act(() => cloud.write("2026-10-11", 2)); // another device, today
    expect(result.current.cups).toBe(2);
  });

  it("doesn't write a new day's count before it has read that day's record", async () => {
    vi.setSystemTime(new Date(2026, 9, 10, 22, 0));
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    act(() => result.current.drink());
    act(() => result.current.drink());

    vi.setSystemTime(new Date(2026, 9, 11, 8, 0));
    act(() => cloud.write("2026-10-11", 5)); // the phone, this morning
    act(() => result.current.drink()); // before today's record has been read
    expect(cloud.days.get("2026-10-11")).toBe(5);
    await flush();
    expect(result.current.cups).toBe(5); // max(1, 5) — the existing first-snapshot merge
    act(() => result.current.drink());
    expect(cloud.days.get("2026-10-11")).toBe(6);
  });

  it("doesn't write over a higher count with a drink made before the first read", async () => {
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
    seed({ day: "2026-10-11", cups: 2 });
    cloud.write("2026-10-11", 5);
    const { result } = renderHook(() => useHydration(synced));
    act(() => result.current.drink());
    expect(cloud.days.get("2026-10-11")).toBe(5);
    await flush();
    expect(result.current.cups).toBe(5);
  });

  it("turning reminders on after midnight doesn't zero today's record", async () => {
    vi.setSystemTime(new Date(2026, 9, 10, 22, 0));
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useHydration({ ...synced, enabled }),
      { initialProps: { enabled: false } }
    );
    await flush();
    act(() => result.current.drink());
    vi.setSystemTime(new Date(2026, 9, 11, 8, 40));
    act(() => cloud.write("2026-10-11", 3));
    rerender({ enabled: true });
    tick(15_000);
    await flush();
    expect(saveHydration).not.toHaveBeenCalledWith(EMAIL, "2026-10-11", 0);
    expect(cloud.days.get("2026-10-11")).toBe(3);
  });

  // Unchanged behaviour, pinned: an offline count reaches an empty cloud record.
  it("uploads today's offline count when the cloud has none", async () => {
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
    seed({ day: "2026-10-11", cups: 2 });
    renderHook(() => useHydration(synced));
    await flush();
    expect(cloud.days.get("2026-10-11")).toBe(2);
  });
});
