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
  saveHydration: vi.fn(async () => {}),
}));
vi.mock("@/features/inventory/data/inventoryData", () => ({
  subscribeItems: () => () => {},
}));

import { saveHydration, subscribeHydration } from "@/features/focus/data/focusData";
import { sourceById } from "@/features/habits/lib/trackableSources";

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
    vi.mocked(saveHydration).mockClear();
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

  it("writes yesterday's count to yesterday only — never over today's cache", () => {
    hydration.mirror!({ email: EMAIL, day: "2026-03-14", canSync: true }, 4);
    expect(saveHydration).toHaveBeenCalledWith(EMAIL, "2026-03-14", 4);
    expect(stored().cups).toBe(2);
  });

  it("stamps today's write with today's day key", () => {
    hydration.mirror!({ email: EMAIL, day: "2026-03-15", canSync: false }, 3);
    expect(stored()).toMatchObject({ day: "2026-03-15", cups: 3 });
  });

  // As before the cache moved: a habits-side write counts as a drink for
  // Focus's reminder clock.
  it("resets Focus's reminder clock when habits logs water", () => {
    hydration.mirror!({ email: EMAIL, day: "2026-03-15", canSync: false }, 4);
    expect(stored().lastDrink).toBe(Date.now());
  });
});

// Offline, a cache-only "missing" answer made the link's first merge push the
// habit's count over another device's on reconnect — as it did in Focus.
describe("hydration source — subscription", () => {
  it("waits for the server's answer, not a cache-only one", () => {
    const cb = vi.fn();
    hydration.subscribe(EMAIL, "2026-03-15", cb);
    expect(subscribeHydration).toHaveBeenCalledWith(EMAIL, "2026-03-15", cb, {
      serverFirst: true,
    });
  });
});
