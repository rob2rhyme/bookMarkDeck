import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The hydration source was handed the day it should act on and ignored it: it
// read and stamped Focus's cache with the WALL-CLOCK day. A habits tab still on
// yesterday just after midnight (its `today` refreshes only on focus) therefore
// wrote yesterday's water count into Focus's cache as today's, and read today's
// count back as yesterday's. CI runs in UTC; this pins a zone and a clock.
vi.mock("@/features/focus/data/focusData", () => ({
  subscribeHydration: vi.fn(() => () => {}),
  subscribeNotes: () => () => {},
  subscribeMeditationSessions: () => () => {},
  subscribeSessions: () => () => {},
  subscribeResets: () => () => {},
  hydrationTransport: { send: vi.fn(), recover: vi.fn() },
}));
vi.mock("@/lib/hydrationOutbox", () => ({
  recordHydration: vi.fn(),
  flushHydration: vi.fn(async () => {}),
  hydrationRetryDue: vi.fn(() => false),
}));
vi.mock("@/features/inventory/data/inventoryData", () => ({
  subscribeItems: () => () => {},
}));

import { hydrationTransport, subscribeHydration } from "@/features/focus/data/focusData";
import { sourceById } from "@/features/habits/lib/trackableSources";
import { flushHydration, hydrationRetryDue, recordHydration } from "@/lib/hydrationOutbox";

const EMAIL = "a@example.com";
const KEY = `bookmarkdeck:focus:hydration:v1:${EMAIL}`;
const hydration = sourceById("hydration")!;
const stored = () => JSON.parse(localStorage.getItem(KEY)!);

describe("hydration source — the day it is given", () => {
  const savedTz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "America/New_York";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 2, 15, 0, 5)); // 00:05, Sun Mar 15
    localStorage.clear();
    vi.mocked(recordHydration).mockClear();
    // Focus's record for today in the pre-upgrade format, as an old bundle writes it.
    localStorage.setItem(KEY, JSON.stringify({ date: "Sun Mar 15 2026", cups: 2, lastDrink: 111 }));
  });
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = savedTz;
  });

  it("reads Focus's count only for the day asked about", () => {
    expect(hydration.readCache(EMAIL, "2026-03-14")).toBeNull();
    expect(hydration.readCache(EMAIL, "2026-03-15")).toBe(2);
  });

  it("sends yesterday's change to yesterday only — never into today's cache", () => {
    hydration.mirror!({ email: EMAIL, day: "2026-03-14", canSync: true }, 4, 3);
    expect(recordHydration).toHaveBeenCalledWith(
      EMAIL,
      "2026-03-14",
      1,
      { send: true },
      hydrationTransport
    );
    expect(stored().cups).toBe(2);
  });

  it("stamps today's write with today's day key", () => {
    hydration.mirror!({ email: EMAIL, day: "2026-03-15", canSync: false }, 3, 2);
    expect(stored()).toMatchObject({ day: "2026-03-15", cups: 3 });
  });

  // As before the cache moved: a habits-side cup counts as a drink for Focus's
  // reminder clock. A cup taken off doesn't.
  it("resets Focus's reminder clock when habits adds water, not when it removes some", () => {
    hydration.mirror!({ email: EMAIL, day: "2026-03-15", canSync: false }, 1, 2);
    expect(stored()).toMatchObject({ cups: 1, lastDrink: 111 });
    hydration.mirror!({ email: EMAIL, day: "2026-03-15", canSync: false }, 2, 1);
    expect(stored().lastDrink).toBe(Date.now());
  });
});

// A tap is the change it makes, recorded in the outbox: a count written outright
// replaced cups logged elsewhere, or was added again on top of cups still on
// their way.
describe("hydration source — a tap is a change", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(recordHydration).mockClear();
  });

  it("records the change, not the count", () => {
    hydration.mirror!({ email: EMAIL, day: "2026-10-11", canSync: true }, 8, 3);
    expect(recordHydration).toHaveBeenCalledExactlyOnceWith(
      EMAIL,
      "2026-10-11",
      5,
      { send: true },
      hydrationTransport
    );
  });

  // Focus's cache can hold cups the habit hasn't heard of yet (taken in Focus,
  // still on their way): writing the habit's count there would drop them.
  it("moves Focus's cache by the change, not to the habit's count", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
    localStorage.setItem(KEY, JSON.stringify({ day: "2026-10-11", cups: 6 }));
    hydration.mirror!({ email: EMAIL, day: "2026-10-11", canSync: true }, 4, 3);
    expect(stored().cups).toBe(7);
    vi.useRealTimers();
  });

  it("records nothing when the count doesn't change", () => {
    hydration.mirror!({ email: EMAIL, day: "2026-10-11", canSync: true }, 3, 3);
    expect(recordHydration).not.toHaveBeenCalled();
  });

  it("holds an unsynced change for later", () => {
    hydration.mirror!({ email: EMAIL, day: "2026-10-11", canSync: false }, 4, 3);
    expect(recordHydration).toHaveBeenCalledWith(
      EMAIL,
      "2026-10-11",
      1,
      { send: false },
      hydrationTransport
    );
  });
});

// Offline, a cache-only "missing" answer made the link's first merge push the
// habit's count over another device's on reconnect — as it did in Focus.
describe("hydration source — subscription", () => {
  it("waits for the server's answer, not a cache-only one", () => {
    const cb = vi.fn();
    const stop = hydration.subscribe(EMAIL, "2026-03-15", cb);
    expect(subscribeHydration).toHaveBeenCalledWith(EMAIL, "2026-03-15", expect.any(Function), {
      serverFirst: true,
    });
    stop();
  });

  // So a Focus tab that closed offline still delivers when habits opens first.
  it("hands over the outbox on the first answer and when the network returns", () => {
    vi.mocked(flushHydration).mockClear();
    const cb = vi.fn();
    const stop = hydration.subscribe(EMAIL, "2026-03-15", cb);
    const answer = vi.mocked(subscribeHydration).mock.lastCall![2];
    answer(3);
    answer(4);
    expect(cb).toHaveBeenNthCalledWith(2, 4);
    expect(flushHydration).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("online"));
    expect(flushHydration).toHaveBeenCalledTimes(2);
    stop();
    window.dispatchEvent(new Event("online"));
    expect(flushHydration).toHaveBeenCalledTimes(2);
  });

  // A change the network kept from landing is retried while habits stays open,
  // even with no focus or `online` event — which a server outage never fires.
  it("retries a flush the outbox says is due, while subscribed", () => {
    vi.useFakeTimers();
    try {
      vi.mocked(flushHydration).mockClear();
      const stop = hydration.subscribe(EMAIL, "2026-03-15", vi.fn());
      vi.advanceTimersByTime(60_000);
      expect(flushHydration).not.toHaveBeenCalled();
      vi.mocked(hydrationRetryDue).mockReturnValue(true);
      vi.advanceTimersByTime(15_000);
      expect(hydrationRetryDue).toHaveBeenCalledWith(EMAIL);
      expect(flushHydration).toHaveBeenCalledOnce();
      stop();
      vi.advanceTimersByTime(60_000);
      expect(flushHydration).toHaveBeenCalledOnce();
    } finally {
      vi.mocked(hydrationRetryDue).mockReturnValue(false);
      vi.useRealTimers();
    }
  });

  // Two habits linked to water each used to make their own retry interval and
  // `online` listener: a due retry ran twice back to back, and the backoff
  // (computed from whatever `retries` held at the moment) doubled twice.
  it("shares one retry interval and one `online` listener across several linked habits", () => {
    vi.useFakeTimers();
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    try {
      vi.mocked(flushHydration).mockClear();
      const stopA = hydration.subscribe(EMAIL, "2026-03-15", vi.fn());
      const stopB = hydration.subscribe(EMAIL, "2026-03-15", vi.fn());
      const onlineAdds = addSpy.mock.calls.filter(([type]) => type === "online").length;
      expect(onlineAdds).toBe(1);
      vi.mocked(hydrationRetryDue).mockReturnValue(true);
      vi.advanceTimersByTime(15_000);
      expect(flushHydration).toHaveBeenCalledOnce();
      // One habit unlinking (or finishing) leaves the other's retry running.
      stopA();
      expect(removeSpy.mock.calls.filter(([type]) => type === "online")).toHaveLength(0);
      vi.mocked(flushHydration).mockClear();
      vi.advanceTimersByTime(15_000);
      expect(flushHydration).toHaveBeenCalledOnce();
      // The last one stopping tears the shared interval and listener down.
      stopB();
      const onlineRemoves = removeSpy.mock.calls.filter(([type]) => type === "online").length;
      expect(onlineRemoves).toBe(1);
      vi.mocked(flushHydration).mockClear();
      vi.advanceTimersByTime(60_000);
      expect(flushHydration).not.toHaveBeenCalled();
    } finally {
      vi.mocked(hydrationRetryDue).mockReturnValue(false);
      addSpy.mockRestore();
      removeSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
