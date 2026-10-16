import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cloud } from "@/test/hydrationCloud";
import { webLocksMock, type LockManagerLike, type WebLocksMock } from "@/test/webLocksMock";

vi.mock("@/features/focus/data/focusData", async () =>
  (await import("@/test/hydrationCloud")).hydrationData()
);
vi.mock("@/features/focus/lib/sound", () => ({ playChime: vi.fn() }));
vi.mock("@/features/focus/lib/notify", () => ({ notify: vi.fn() }));

import {
  fetchHydration,
  hydrationTransport,
  saveHydration,
  subscribeHydration,
} from "@/features/focus/data/focusData";

type UseHydration = typeof import("./useHydration").useHydration;

/**
 * A tab: its own copy of the hook, and of the outbox under it. Tabs share
 * localStorage, the lock registry and the cloud, as they do in a browser; one
 * copy shared by two "tabs" makes one tab's state the other's.
 */
async function tab(): Promise<UseHydration> {
  vi.resetModules();
  return (await import("./useHydration")).useHydration;
}
let useHydration: UseHydration;

const EMAIL = "a@example.com";
const KEY = `bookmarkdeck:focus:hydration:v1:${EMAIL}`;
const OUTBOX = `bookmarkdeck:focus:hydration-outbox:v1:${EMAIL}:`;
const ARGS = { email: EMAIL, enabled: false, intervalMin: 60, goal: 8, soundEnabled: false };
const seed = (rec: object) => localStorage.setItem(KEY, JSON.stringify(rec));
const stored = () => JSON.parse(localStorage.getItem(KEY)!);
const outbox = () => Object.keys(localStorage).filter((k) => k.startsWith(OUTBOX));
const mount = () => renderHook(() => useHydration(ARGS));
/** Let every pending promise, lock grant and snapshot run. */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 50; i++) await Promise.resolve();
  });

let locks: WebLocksMock;
let page: LockManagerLike;
beforeEach(async () => {
  locks = webLocksMock();
  page = locks.client();
  locks.use(page);
  useHydration = await tab();
});
afterEach(() => locks.uninstall());

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
    await flush();
    expect(cloud.days.get("2026-10-10")).toBe(2);

    // The laptop sleeps — its timers don't run — and the phone logs 3 cups.
    vi.setSystemTime(new Date(2026, 9, 11, 8, 0));
    act(() => cloud.write("2026-10-11", 3));
    tick(15_000); // it wakes
    await flush();
    expect(cloud.days.get("2026-10-11")).toBe(3);
    expect(result.current.cups).toBe(3);

    // …and the two stay in step from then on.
    act(() => cloud.write("2026-10-11", 4));
    expect(result.current.cups).toBe(4);
    act(() => result.current.drink());
    await flush();
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

  it("adds a drink made before the new day's record is read to that record", async () => {
    vi.setSystemTime(new Date(2026, 9, 10, 22, 0));
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    act(() => result.current.drink());
    act(() => result.current.drink());

    vi.setSystemTime(new Date(2026, 9, 11, 8, 0));
    act(() => cloud.write("2026-10-11", 5)); // the phone, this morning
    act(() => result.current.drink()); // before today's record has been read
    await flush();
    // The phone's 5, plus this cup.
    expect(result.current.cups).toBe(6);
    expect(cloud.days.get("2026-10-11")).toBe(6);
    expect(cloud.days.get("2026-10-10")).toBe(2);
    act(() => result.current.drink());
    await flush();
    expect(cloud.days.get("2026-10-11")).toBe(7);
  });

  it("adds a drink made before the first read to a higher count", async () => {
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
    seed({ day: "2026-10-11", cups: 2 });
    cloud.write("2026-10-11", 5);
    const { result } = renderHook(() => useHydration(synced));
    act(() => result.current.drink());
    await flush();
    expect(result.current.cups).toBe(6);
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
    expect(cloud.days.get("2026-10-11")).toBe(3);
  });

  it("removes a cup removed before the first read", async () => {
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
    seed({ day: "2026-10-11", cups: 3 });
    cloud.write("2026-10-11", 3);
    const { result } = renderHook(() => useHydration(synced));
    act(() => result.current.removeCup());
    await flush();
    expect(result.current.cups).toBe(2);
    expect(cloud.days.get("2026-10-11")).toBe(2);
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
    await flush();
    expect(cloud.days.get("2026-10-11")).toBe(5);
    expect(result.current.cups).toBe(5);
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
    await flush();
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

  it("doesn't log a total after reconnecting, until the record is read again", async () => {
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
    const onLog = vi.fn();
    const { result, rerender } = renderHook(
      ({ connected }: { connected: boolean }) => useHydration({ ...ARGS, connected, onLog }),
      { initialProps: { connected: true } }
    );
    await flush();
    rerender({ connected: false });
    cloud.write("2026-10-11", 4); // the phone, meanwhile
    cloud.goSilent();
    rerender({ connected: true });
    act(() => result.current.drink());
    expect(onLog).toHaveBeenLastCalledWith("hydration", "Drank a cup of water");
  });

  it("doesn't log a total before the day's record has been read", async () => {
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
    cloud.write("2026-10-11", 5);
    const onLog = vi.fn();
    const { result } = renderHook(() => useHydration({ ...synced, onLog }));
    act(() => result.current.drink()); // the record holds 5 more than this tab knows
    expect(onLog).toHaveBeenLastCalledWith("hydration", "Drank a cup of water");
    await flush();
    act(() => result.current.drink());
    expect(onLog).toHaveBeenLastCalledWith("hydration", "Drank a cup of water (7 cups today)");
  });

  // Sync to cloud runs while a cup is still on its way; it must not send it again.
  it("doesn't count a cup twice when Sync to cloud runs before it lands", async () => {
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
    seed({ day: "2026-10-11", cups: 2 });
    cloud.write("2026-10-11", 2);
    cloud.goSilent();
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    act(() => result.current.drink());
    act(() => void result.current.pushToCloud());
    await flush();
    act(() => cloud.reconnect());
    await flush();
    act(() => void result.current.pushToCloud());
    await flush();
    expect(result.current.cups).toBe(3);
    expect(cloud.days.get("2026-10-11")).toBe(3);
  });

  it("doesn't re-add cups after a Download when the connection comes back", async () => {
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
    cloud.write("2026-10-11", 4);
    const { result, rerender } = renderHook(
      ({ connected }: { connected: boolean }) => useHydration({ ...ARGS, connected }),
      { initialProps: { connected: true } }
    );
    await flush();
    await act(() => result.current.pullFromCloud());
    act(() => result.current.drink());
    await flush();
    expect(cloud.days.get("2026-10-11")).toBe(5);
    rerender({ connected: false });
    rerender({ connected: true });
    await flush();
    expect(result.current.cups).toBe(5);
    expect(cloud.days.get("2026-10-11")).toBe(5);
  });

  // Offline across midnight, cups taken before the server ever answered still
  // belong to the day they were taken on, beside the phone's cups that evening.
  it("delivers a day's unread cups to it after the day ends", async () => {
    vi.setSystemTime(new Date(2026, 9, 10, 23, 50));
    seed({ day: "2026-10-10", cups: 2 });
    cloud.write("2026-10-10", 2);
    cloud.goSilent();
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    act(() => result.current.drink());
    act(() => result.current.drink());
    cloud.add("2026-10-10", 3); // the phone, meanwhile
    tick(15 * 60_000); // midnight passes
    act(() => cloud.reconnect());
    await flush();
    expect(cloud.days.get("2026-10-10")).toBe(7);
    expect(cloud.days.has("2026-10-11")).toBe(false);
  });

  it("drops a Download that lands after midnight", async () => {
    vi.setSystemTime(new Date(2026, 9, 10, 23, 59));
    cloud.write("2026-10-10", 9);
    let land: (v: number) => void = () => {};
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    vi.mocked(fetchHydration).mockImplementationOnce(
      () => new Promise<number | null>((r) => (land = r))
    );
    let download: Promise<void> = Promise.resolve();
    act(() => void (download = result.current.pullFromCloud()));
    vi.setSystemTime(new Date(2026, 9, 11, 0, 1));
    tick(15_000);
    await act(async () => {
      land(9); // yesterday's count
      await download;
    });
    expect(result.current.cups).toBe(0);
    expect(stored()).toMatchObject({ day: "2026-10-11", cups: 0 });
  });

  it("drops a Download that lands after switching accounts", async () => {
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
    let land: (v: number) => void = () => {};
    vi.mocked(fetchHydration).mockImplementationOnce(
      () => new Promise<number | null>((r) => (land = r))
    );
    const { result, rerender } = renderHook(
      ({ email }: { email: string }) => useHydration({ ...synced, email }),
      { initialProps: { email: EMAIL } }
    );
    await flush();
    let download: Promise<void> = Promise.resolve();
    act(() => void (download = result.current.pullFromCloud()));
    rerender({ email: "b@example.com" });
    await flush();
    await act(async () => {
      land(9); // account A's count
      await download;
    });
    expect(result.current.cups).toBe(0);
    expect(localStorage.getItem("bookmarkdeck:focus:hydration:v1:b@example.com")).not.toContain(
      '"cups":9'
    );
  });
});

// Every cup is sent as an increment, through the outbox, so cups taken on
// several devices or in several tabs add up. They used to be written as the
// count on screen, and the last count written won: a laptop offline for an hour
// replaced the phone's cups with its own number on reconnect, a stale cache put
// back a cup removed elsewhere, and two tabs each kept only their own cups.
describe("useHydration — every change is an increment", () => {
  const DAY = "2026-10-11";
  const synced = { ...ARGS, connected: true };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
    localStorage.clear();
    cloud.reset();
    vi.mocked(hydrationTransport.send).mockClear();
    vi.mocked(hydrationTransport.recover).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("adds an offline cup to the cups another device logged meanwhile", async () => {
    cloud.write(DAY, 3);
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    cloud.goSilent();
    act(() => result.current.drink());
    await flush();
    expect(result.current.cups).toBe(4);
    cloud.add(DAY, 2); // the phone, unheard here
    act(() => cloud.reconnect());
    await flush();
    expect(cloud.days.get(DAY)).toBe(6);
    expect(result.current.cups).toBe(6);
  });

  it("takes the record's count over a stale cached one, and writes nothing", async () => {
    seed({ day: DAY, cups: 5 }); // before a cup was removed on the phone
    cloud.write(DAY, 3);
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    expect(result.current.cups).toBe(3);
    expect(cloud.days.get(DAY)).toBe(3);
    expect(stored().cups).toBe(3);
  });

  it("adds up cups taken in two tabs while offline", async () => {
    cloud.write(DAY, 2);
    const other = await tab();
    const a = renderHook(() => useHydration(synced));
    const b = renderHook(() => other(synced));
    await flush();
    cloud.goSilent();
    act(() => a.result.current.drink());
    act(() => b.result.current.drink());
    act(() => cloud.reconnect());
    await flush();
    expect(cloud.days.get(DAY)).toBe(4);
    expect(a.result.current.cups).toBe(4);
    expect(b.result.current.cups).toBe(4);
  });

  it("delivers a cup from a tab that closed offline, through the next tab", async () => {
    cloud.write(DAY, 3);
    const first = renderHook(() => useHydration(synced));
    await flush();
    cloud.goSilent();
    act(() => first.result.current.drink());
    await flush();
    // The tab closes before the network is back: its queued write dies with it.
    first.unmount();
    cloud.killTab();
    locks.crash(page);
    cloud.add(DAY, 1); // the phone
    act(() => cloud.reconnect());
    locks.use(locks.client());
    const nextTab = await tab();
    const next = renderHook(() => nextTab(synced));
    await flush();
    expect(cloud.days.get(DAY)).toBe(5);
    expect(next.result.current.cups).toBe(5);
    expect(outbox()).toEqual([]);
  });

  it("doesn't resend a cup whose write landed but was never acknowledged", async () => {
    cloud.write(DAY, 3);
    const first = renderHook(() => useHydration(synced));
    await flush();
    cloud.loseAcks();
    act(() => first.result.current.drink());
    await flush();
    first.unmount();
    cloud.killTab();
    locks.crash(page);
    locks.use(locks.client());
    const nextTab = await tab();
    renderHook(() => nextTab(synced));
    await flush();
    expect(cloud.days.get(DAY)).toBe(4);
    expect(outbox()).toEqual([]);
  });

  it("leaves a cup another live tab is sending, and sends it once that tab is gone", async () => {
    cloud.write(DAY, 3);
    localStorage.setItem(`${OUTBOX}x`, JSON.stringify({ day: DAY, delta: 1, at: 1 }));
    const release = locks.holdAs("bookmarkdeck:hydration-op:x");
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    expect(cloud.days.get(DAY)).toBe(3);
    release(); // that tab closes
    act(() => void window.dispatchEvent(new Event("online")));
    await flush();
    expect(cloud.days.get(DAY)).toBe(4);
    expect(result.current.cups).toBe(4);
    act(() => void window.dispatchEvent(new Event("online")));
    await flush();
    expect(cloud.days.get(DAY)).toBe(4);
  });

  it("hands over queued cups when the window regains focus", async () => {
    cloud.write(DAY, 3);
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    localStorage.setItem(`${OUTBOX}x`, JSON.stringify({ day: DAY, delta: 1, at: 1 }));
    act(() => void window.dispatchEvent(new Event("focus")));
    await flush();
    expect(cloud.days.get(DAY)).toBe(4);
    expect(result.current.cups).toBe(4);
  });

  it("hands over queued cups when the tab becomes visible", async () => {
    cloud.write(DAY, 3);
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    localStorage.setItem(`${OUTBOX}x`, JSON.stringify({ day: DAY, delta: 1, at: 1 }));
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    await flush();
    expect(cloud.days.get(DAY)).toBe(4);
    expect(result.current.cups).toBe(4);
  });

  // A server outage fires no `online` event, and a tab left open may get no
  // focus either: what the outbox couldn't deliver is retried on the clock.
  it("retries what it couldn't deliver while the tab stays open", async () => {
    cloud.write(DAY, 3);
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    cloud.goSilent();
    localStorage.setItem(`${OUTBOX}x`, JSON.stringify({ day: DAY, delta: 1, at: 1 }));
    act(() => void window.dispatchEvent(new Event("focus")));
    await flush();
    expect(outbox()).toHaveLength(1);
    act(() => cloud.reconnect());
    await flush();
    expect(cloud.days.get(DAY)).toBe(3);
    act(() => void vi.advanceTimersByTime(30_000));
    await flush();
    expect(cloud.days.get(DAY)).toBe(4);
    expect(result.current.cups).toBe(4);
    expect(outbox()).toEqual([]);
  });

  // The server's first answer leaves out what the outbox is still delivering,
  // so the total isn't known until it lands.
  it("doesn't log a total while the day has changes still to deliver", async () => {
    cloud.write(DAY, 3);
    localStorage.setItem(`${OUTBOX}x`, JSON.stringify({ day: DAY, delta: 1, at: 1 }));
    let open = () => {};
    vi.mocked(hydrationTransport.recover).mockImplementationOnce(async (...args) => {
      await new Promise<void>((r) => (open = r));
      return cloud.recover(args[1], args[2], args[3]);
    });
    const onLog = vi.fn();
    const { result } = renderHook(() => useHydration({ ...synced, onLog }));
    await flush();
    expect(hydrationTransport.recover).toHaveBeenCalledOnce();
    act(() => result.current.drink());
    expect(onLog).toHaveBeenLastCalledWith("hydration", "Drank a cup of water");
    open();
    await flush();
    expect(cloud.days.get(DAY)).toBe(5);
    act(() => result.current.drink());
    expect(onLog).toHaveBeenLastCalledWith("hydration", "Drank a cup of water (6 cups today)");
  });

  it("sends and logs one cup per drink under StrictMode", async () => {
    cloud.write(DAY, 3);
    const onLog = vi.fn();
    const { result } = renderHook(() => useHydration({ ...synced, onLog }), {
      wrapper: StrictMode,
    });
    await flush();
    act(() => result.current.drink());
    await flush();
    expect(onLog).toHaveBeenCalledExactlyOnceWith("hydration", "Drank a cup of water (4 cups today)");
    expect(hydrationTransport.send).toHaveBeenCalledOnce();
    expect(cloud.days.get(DAY)).toBe(4);
  });

  it("sends nothing when removing a cup at 0", async () => {
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    act(() => result.current.removeCup());
    await flush();
    expect(result.current.cups).toBe(0);
    expect(cloud.days.has(DAY)).toBe(false);
    expect(outbox()).toEqual([]);
  });

  it("lands a cup taken offline before midnight on that day, beside the phone's", async () => {
    vi.setSystemTime(new Date(2026, 9, 10, 23, 50));
    cloud.write("2026-10-10", 2);
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    cloud.goSilent();
    act(() => result.current.drink());
    cloud.add("2026-10-10", 1); // the phone, unheard here
    act(() => void vi.advanceTimersByTime(15 * 60_000)); // midnight passes
    act(() => cloud.reconnect());
    await flush();
    expect(cloud.days.get("2026-10-10")).toBe(4);
    expect(cloud.days.has(DAY)).toBe(false);
    expect(result.current.cups).toBe(0);
  });

  // The SDK's answer is stale while this page's change is unacknowledged: a day
  // never read answered 1 against the emulator, with the server at 6.
  it("keeps the count on screen when Download can't see the server past a pending cup", async () => {
    cloud.write(DAY, 3);
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    cloud.goSilent();
    act(() => result.current.drink());
    await act(() => result.current.pullFromCloud());
    expect(result.current.cups).toBe(4);
    expect(stored().cups).toBe(4);
  });

  it("Sync to cloud hands over queued cups", async () => {
    cloud.write(DAY, 3);
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    localStorage.setItem(`${OUTBOX}x`, JSON.stringify({ day: DAY, delta: 1, at: 1 }));
    await act(() => result.current.pushToCloud());
    expect(cloud.days.get(DAY)).toBe(4);
    expect(outbox()).toEqual([]);
  });

  it("Sync to cloud never writes the count on screen", async () => {
    seed({ day: DAY, cups: 5 });
    cloud.write(DAY, 3);
    cloud.goSilent();
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    expect(result.current.cups).toBe(5); // the cache, until the record is read
    act(() => void result.current.pushToCloud());
    await flush();
    act(() => cloud.reconnect());
    await flush();
    expect(cloud.days.get(DAY)).toBe(3);
    expect(result.current.cups).toBe(3);
  });

  it("counts two drinks in one batch as two", async () => {
    const onLog = vi.fn();
    const { result } = renderHook(() => useHydration({ ...synced, onLog }));
    await flush();
    act(() => {
      result.current.drink();
      result.current.drink();
    });
    await flush();
    expect(result.current.cups).toBe(2);
    expect(hydrationTransport.send).toHaveBeenCalledTimes(2);
    expect(cloud.days.get(DAY)).toBe(2);
    expect(onLog.mock.calls.map((c) => c[1])).toEqual([
      "Drank a cup of water (1 cup today)",
      "Drank a cup of water (2 cups today)",
    ]);
  });

  it("keeps cups taken before connecting, and delivers them once connected", async () => {
    const { result, rerender } = renderHook(
      ({ connected }: { connected: boolean }) => useHydration({ ...ARGS, connected }),
      { initialProps: { connected: false } }
    );
    act(() => result.current.drink());
    act(() => result.current.drink());
    act(() => result.current.drink());
    act(() => result.current.removeCup());
    await flush();
    expect(outbox()).toHaveLength(4);
    act(() => void window.dispatchEvent(new Event("online")));
    act(() => void window.dispatchEvent(new Event("focus")));
    await act(() => result.current.pushToCloud());
    await flush();
    // Not connected: sending would ask to sign in.
    expect(hydrationTransport.send).not.toHaveBeenCalled();
    expect(hydrationTransport.recover).not.toHaveBeenCalled();
    expect(outbox()).toHaveLength(4);
    cloud.write(DAY, 1); // the phone
    rerender({ connected: true });
    await flush();
    expect(cloud.days.get(DAY)).toBe(3);
    expect(result.current.cups).toBe(3);
    expect(outbox()).toEqual([]);
  });

  // A removal sent ahead of the cup it removes reaches 0 and is clamped there,
  // and the cup then lands: the day ends one high. Within one page, a change
  // waits behind its day's undelivered changes instead.
  it("delivers a removal after the queued cup it removes", async () => {
    const { result, rerender } = renderHook(
      ({ connected }: { connected: boolean }) => useHydration({ ...ARGS, connected }),
      { initialProps: { connected: false } }
    );
    await flush();
    act(() => result.current.drink()); // stored, waiting for a flush
    await flush();
    cloud.goSilent(); // no first answer yet
    rerender({ connected: true });
    await flush();
    act(() => result.current.removeCup());
    await flush();
    act(() => cloud.reconnect());
    act(() => void window.dispatchEvent(new Event("online")));
    await flush();
    await flush();
    expect(cloud.days.get(DAY)).toBe(0);
    expect(outbox()).toEqual([]);
  });

  // A count in the cache alone can't say which of its cups the cloud already
  // has, so it is never uploaded; the record's count is taken instead.
  it("doesn't upload a cached count no change in the outbox accounts for", async () => {
    seed({ day: DAY, cups: 2 });
    const { result } = renderHook(() => useHydration(synced));
    await flush();
    expect(cloud.days.has(DAY)).toBe(false);
    expect(result.current.cups).toBe(0);
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
