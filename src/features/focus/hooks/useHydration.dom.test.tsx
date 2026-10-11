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

import { saveHydration, subscribeHydration } from "@/features/focus/data/focusData";
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
    // The phone's 5, plus this cup: kept, not swallowed by the merge.
    expect(result.current.cups).toBe(6);
    expect(cloud.days.get("2026-10-11")).toBe(6);
    act(() => result.current.drink());
    expect(cloud.days.get("2026-10-11")).toBe(7);
  });

  it("doesn't write over a higher count with a drink made before the first read", async () => {
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
    seed({ day: "2026-10-11", cups: 2 });
    cloud.write("2026-10-11", 5);
    const { result } = renderHook(() => useHydration(synced));
    act(() => result.current.drink());
    expect(cloud.days.get("2026-10-11")).toBe(5);
    await flush();
    expect(result.current.cups).toBe(6); // max(2, 5) + this cup
    expect(cloud.days.get("2026-10-11")).toBe(6);
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

  it("keeps a cup removed before the first read, instead of merging it back", async () => {
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
    seed({ day: "2026-10-11", cups: 3 });
    cloud.write("2026-10-11", 3);
    const { result } = renderHook(() => useHydration(synced));
    act(() => result.current.removeCup());
    await flush();
    expect(result.current.cups).toBe(2);
    expect(cloud.days.get("2026-10-11")).toBe(2);
  });

  it("writes a gap drink back when the cloud's count is lower", async () => {
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
    seed({ day: "2026-10-11", cups: 2 }); // logged offline earlier
    cloud.write("2026-10-11", 1);
    const { result } = renderHook(() => useHydration(synced));
    act(() => result.current.drink());
    await flush();
    expect(result.current.cups).toBe(3); // max(2, 1) + this cup
    expect(cloud.days.get("2026-10-11")).toBe(3);
  });

  it("waits for the record again after reconnecting", async () => {
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
    const { result, rerender } = renderHook(
      ({ connected }: { connected: boolean }) => useHydration({ ...ARGS, connected }),
      { initialProps: { connected: true } }
    );
    await flush();
    rerender({ connected: false });
    act(() => cloud.write("2026-10-11", 4)); // the phone, while this one was offline
    rerender({ connected: true });
    act(() => result.current.drink()); // before the reconnected record is read
    expect(cloud.days.get("2026-10-11")).toBe(4);
    await flush();
    expect(cloud.days.get("2026-10-11")).toBe(5);
  });

  it("asks for the server's answer, not a cache-only one", async () => {
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
    renderHook(() => useHydration(synced));
    await flush();
    expect(subscribeHydration).toHaveBeenCalledWith(
      EMAIL,
      "2026-10-11",
      expect.any(Function),
      { serverFirst: true }
    );
  });

  it("caches the new day's count when a drink lands on yesterday's number", () => {
    vi.setSystemTime(new Date(2026, 2, 10, 23, 59, 50));
    seed({ day: "2026-03-10", cups: 1 });
    const { result, unmount } = mount();
    vi.setSystemTime(new Date(2026, 2, 11, 0, 0, 5)); // before the clock has ticked
    act(() => result.current.drink()); // the new day's first cup: 1, as yesterday
    expect(stored()).toMatchObject({ day: "2026-03-11", cups: 1 });
    unmount();
    expect(mount().result.current.cups).toBe(1);
  });

  it("rolls over when the window regains focus", () => {
    vi.setSystemTime(new Date(2026, 2, 10, 23, 50));
    seed({ day: "2026-03-10", cups: 5 });
    const { result } = mount();
    vi.setSystemTime(new Date(2026, 2, 11, 7, 0));
    act(() => void window.dispatchEvent(new Event("focus")));
    expect(result.current.cups).toBe(0);
  });

  it("rolls over when the tab becomes visible", () => {
    vi.setSystemTime(new Date(2026, 2, 10, 23, 50));
    seed({ day: "2026-03-10", cups: 5 });
    const { result } = mount();
    vi.setSystemTime(new Date(2026, 2, 11, 7, 0));
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(result.current.cups).toBe(0);
  });

  // The roll and a snapshot of yesterday can arrive in the same tick, before the
  // old listener is torn down; the snapshot must not land on the new day.
  it("drops a snapshot of yesterday that arrives with the rollover", async () => {
    vi.setSystemTime(new Date(2026, 9, 10, 23, 59, 30));
    cloud.write("2026-10-10", 5);
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    vi.setSystemTime(new Date(2026, 9, 11, 0, 0, 5));
    act(() => {
      window.dispatchEvent(new Event("focus")); // rolls: today is Oct 11
      cloud.snapshot("2026-10-10", 6); // yesterday's listener is still attached
    });
    expect(result.current.cups).toBe(0);
  });

  // Before the roll, the count on screen is still yesterday's; a change to it
  // must stay yesterday's, not be cached as today's.
  it("doesn't cache a late change to yesterday as today's count", async () => {
    vi.setSystemTime(new Date(2026, 9, 10, 23, 59, 50));
    cloud.write("2026-10-10", 5);
    renderHook(() => useHydration(synced));
    await flush();
    vi.setSystemTime(new Date(2026, 9, 11, 0, 0, 5)); // midnight, not yet noticed
    act(() => cloud.write("2026-10-10", 6));
    expect(stored().day).not.toBe("2026-10-11");
  });

  it("removes a cup from today's record after midnight, not yesterday's", async () => {
    vi.setSystemTime(new Date(2026, 9, 10, 22, 0));
    cloud.write("2026-10-10", 3);
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    vi.setSystemTime(new Date(2026, 9, 11, 8, 0));
    act(() => result.current.removeCup());
    expect(cloud.days.get("2026-10-10")).toBe(3);
  });

  it("downloads today's record after midnight", async () => {
    vi.setSystemTime(new Date(2026, 9, 10, 22, 0));
    cloud.write("2026-10-10", 3);
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    vi.setSystemTime(new Date(2026, 9, 11, 8, 0));
    cloud.days.set("2026-10-11", 4); // there, but not yet heard by any listener
    await act(() => result.current.pullFromCloud());
    expect(result.current.cups).toBe(4);
  });

  // An explicit upload writes the count on screen to the day it belongs to — a
  // pair — even before the record has been read; that is what the button is for.
  it("uploads the count on screen to its own day", async () => {
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
    seed({ day: "2026-10-11", cups: 2 });
    const { result } = renderHook(() => useHydration(synced));
    await act(() => result.current.pushToCloud());
    expect(saveHydration).toHaveBeenCalledWith(EMAIL, "2026-10-11", 2);
  });

  it("doesn't log a total before the day's record has been read", async () => {
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
    cloud.write("2026-10-11", 5);
    const onLog = vi.fn();
    const { result } = renderHook(() => useHydration({ ...synced, onLog }));
    act(() => result.current.drink()); // the merge will make this 6, not 1
    expect(onLog).toHaveBeenLastCalledWith("hydration", "Drank a cup of water");
    await flush();
    act(() => result.current.drink());
    expect(onLog).toHaveBeenLastCalledWith("hydration", "Drank a cup of water (7 cups today)");
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

// The time of the last drink is part of the record: a reload keeps it, so a
// reminder due in 10 minutes doesn't restart at 60.
describe("useHydration — the reminder clock", () => {
  const savedTz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "America/New_York";
    vi.useFakeTimers();
    localStorage.clear();
    cloud.reset();
  });
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = savedTz;
  });

  it("survives a reload", () => {
    vi.setSystemTime(new Date(2026, 9, 11, 14, 0));
    const fiftyMinutesAgo = Date.now() - 50 * 60_000;
    seed({ day: "2026-10-11", cups: 3, lastDrink: fiftyMinutesAgo });
    const { result } = renderHook(() =>
      useHydration({ ...ARGS, enabled: true, intervalMin: 60 })
    );
    expect(stored().lastDrink).toBe(fiftyMinutesAgo);
    act(() => void vi.advanceTimersByTime(11 * 60_000)); // 61 minutes since that drink
    expect(result.current.reminding).toBe(true);
  });
});
