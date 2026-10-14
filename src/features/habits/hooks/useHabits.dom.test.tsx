import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cloud } from "@/test/hydrationCloud";
import { webLocksMock, type LockManagerLike, type WebLocksMock } from "@/test/webLocksMock";

vi.mock("@/features/focus/data/focusData", async () => ({
  ...(await import("@/test/hydrationCloud")).hydrationData(),
  subscribeNotes: () => () => {},
  subscribeMeditationSessions: () => () => {},
  subscribeSessions: () => () => {},
  subscribeResets: () => () => {},
}));
vi.mock("@/features/inventory/data/inventoryData", () => ({ subscribeItems: () => () => {} }));
vi.mock("@/features/habits/data/habitData", () => ({
  deleteEntry: vi.fn(async () => {}),
  deleteHabit: vi.fn(async () => {}),
  fetchEntries: vi.fn(async () => []),
  fetchHabits: vi.fn(async () => []),
  saveEntry: vi.fn(async () => {}),
  saveHabit: vi.fn(async () => {}),
  subscribeEntries: () => () => {},
  subscribeHabits: () => () => {},
}));
vi.mock("@/features/focus/lib/sound", () => ({ playChime: vi.fn() }));
vi.mock("@/features/focus/lib/notify", () => ({ notify: vi.fn() }));

import { hydrationTransport } from "@/features/focus/data/focusData";
import { useHydration } from "@/features/focus/hooks/useHydration";
import type { Habit } from "@/features/habits/lib/types";
import { useHabits } from "./useHabits";

const EMAIL = "a@example.com";
const DAY = "2026-10-11";
const water = {
  id: "w",
  name: "Drink water",
  type: "measurable",
  unit: "cups",
  target: 8,
  schedule: { type: "daily" },
  sortOrder: 0,
};
const focusArgs = {
  email: EMAIL,
  connected: true,
  enabled: false,
  intervalMin: 60,
  goal: 8,
  soundEnabled: false,
};
/** Let every pending promise, lock grant and snapshot run. */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 50; i++) await Promise.resolve();
  });
const sent = () => vi.mocked(hydrationTransport.send).mock.calls.map((c) => c[2]);

let locks: WebLocksMock;
let page: LockManagerLike;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date(2026, 9, 11, 9, 0));
  localStorage.clear();
  localStorage.setItem(`bookmarkdeck:habits:v1:${EMAIL}`, JSON.stringify([water]));
  cloud.reset();
  vi.mocked(hydrationTransport.send).mockClear();
  locks = webLocksMock();
  page = locks.client();
  locks.use(page);
});
afterEach(() => {
  locks.uninstall();
  vi.useRealTimers();
});

async function openHabits() {
  const hook = renderHook(() => useHabits(EMAIL, true));
  await flush();
  const habit = () => hook.result.current.habits.find((h) => h.id === "w") as Habit;
  const count = () => {
    const e = hook.result.current.todayEntry("w");
    return e && e.status === "done" ? e.count : 0;
  };
  return { hook, habit, count };
}

// A water habit's taps reach Focus's record as increments of the change they
// make, so they add to cups logged anywhere else. They used to be written as
// the habit's count, and the habit's first snapshot pushed a higher count back:
// with Focus's cups queued in the outbox, both counted them, once each.
describe("useHabits — the water link", () => {
  it("sends each tap as the change it makes", async () => {
    const { hook, habit, count } = await openHabits();
    act(() => hook.result.current.adjustToday(habit(), 1));
    act(() => hook.result.current.adjustToday(habit(), 1));
    act(() => hook.result.current.logDetail(habit(), { status: "done", count: 8 }));
    act(() => hook.result.current.toggleToday(habit())); // done → cleared
    act(() => hook.result.current.undoToday(habit())); // back to 8
    act(() => hook.result.current.skipToday(habit()));
    await flush();
    expect(sent()).toEqual([1, 1, 6, -8, 8, -8]);
    expect(count()).toBe(0);
    expect(cloud.days.get(DAY)).toBe(0);
  });

  it("sends the reverse of the change an undo takes back", async () => {
    const { hook, habit } = await openHabits();
    act(() => hook.result.current.adjustToday(habit(), 2));
    act(() => hook.result.current.adjustToday(habit(), 1));
    act(() => hook.result.current.undoToday(habit()));
    await flush();
    expect(sent()).toEqual([2, 1, -1]);
  });

  it("sends the change a log for today makes, and the cups its clear removes", async () => {
    const { hook, habit } = await openHabits();
    act(() => hook.result.current.adjustToday(habit(), 2));
    act(() => hook.result.current.logEntryFor(habit(), DAY, { status: "done", count: 5 }));
    act(() => hook.result.current.logDetail(habit(), { status: "clear" }));
    await flush();
    expect(sent()).toEqual([2, 3, -5]);
  });

  it("sends the cups a step down to 0 removes", async () => {
    const { hook, habit, count } = await openHabits();
    act(() => hook.result.current.adjustToday(habit(), 2));
    act(() => hook.result.current.adjustToday(habit(), -2));
    await flush();
    expect(sent()).toEqual([2, -2]);
    expect(count()).toBe(0);
  });

  it("sends the cups a toggle adds to reach the target", async () => {
    const { hook, habit } = await openHabits();
    act(() => hook.result.current.adjustToday(habit(), 2));
    act(() => hook.result.current.toggleToday(habit()));
    await flush();
    expect(sent()).toEqual([2, 6]);
  });

  it("follows snapshots that arrive several to a render", async () => {
    cloud.write(DAY, 3);
    const { count } = await openHabits();
    act(() => {
      cloud.write(DAY, 0); // removed elsewhere…
      cloud.write(DAY, 3); // …and put back
    });
    await flush();
    expect(count()).toBe(3);
  });

  it("sends nothing for a past day, and a clear sends the cups it removes", async () => {
    const { hook, habit } = await openHabits();
    act(() => hook.result.current.logEntryFor(habit(), "2026-10-10", { status: "done", count: 3 }));
    act(() => hook.result.current.adjustToday(habit(), 3));
    act(() => hook.result.current.clearToday(habit()));
    act(() => hook.result.current.adjustToday(habit(), 2));
    act(() => hook.result.current.clearEntryFor(habit(), DAY));
    act(() => hook.result.current.adjustToday(habit(), 1));
    act(() => hook.result.current.logEntryFor(habit(), DAY, { status: "clear" }));
    await flush();
    expect(sent()).toEqual([3, -3, 2, -2, 1, -1]);
  });

  it("adds a tap to cups logged elsewhere, instead of writing the habit's count", async () => {
    cloud.write(DAY, 5); // Focus, on the phone
    const { hook, habit, count } = await openHabits();
    expect(count()).toBe(5);
    cloud.goSilent();
    act(() => hook.result.current.adjustToday(habit(), 1));
    cloud.add(DAY, 2); // the phone again, unheard here
    act(() => cloud.reconnect());
    await flush();
    expect(cloud.days.get(DAY)).toBe(8);
    expect(count()).toBe(8);
  });

  it("takes the record's count on the first snapshot, and writes nothing back", async () => {
    // Focus's cache, written before a cup was removed on another device.
    localStorage.setItem(
      `bookmarkdeck:focus:hydration:v1:${EMAIL}`,
      JSON.stringify({ day: DAY, cups: 5 })
    );
    cloud.write(DAY, 3);
    const { count } = await openHabits();
    expect(count()).toBe(3);
    expect(cloud.days.get(DAY)).toBe(3);
    expect(sent()).toEqual([]);
  });

  it("moves Focus's cache by the change, and its reminder clock only for a drink", async () => {
    const key = `bookmarkdeck:focus:hydration:v1:${EMAIL}`;
    localStorage.setItem(key, JSON.stringify({ day: DAY, cups: 6, lastDrink: 111 }));
    cloud.write(DAY, 6);
    const { hook, habit } = await openHabits();
    act(() => hook.result.current.adjustToday(habit(), -1));
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ cups: 5, lastDrink: 111 });
    act(() => hook.result.current.adjustToday(habit(), 1));
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ cups: 6, lastDrink: Date.now() });
  });

  // The reviewer's repro: a Focus tab took two cups offline and closed before
  // they landed, so they live only in the outbox and Focus's cache (5).
  async function cupsLeftInTheOutbox() {
    cloud.write(DAY, 3);
    const focus = renderHook(() => useHydration(focusArgs));
    await flush();
    cloud.goSilent();
    act(() => focus.result.current.drink());
    act(() => focus.result.current.drink());
    await flush();
    focus.unmount();
    cloud.killTab();
    locks.crash(page);
    act(() => cloud.reconnect());
    locks.use((page = locks.client()));
    vi.mocked(hydrationTransport.send).mockClear();
  }

  it("counts cups a closed Focus tab left in the outbox once, when habits opens first", async () => {
    await cupsLeftInTheOutbox();
    const { count } = await openHabits();
    expect(cloud.days.get(DAY)).toBe(5);
    expect(count()).toBe(5);
    locks.use(locks.client());
    renderHook(() => useHydration(focusArgs));
    await flush();
    expect(cloud.days.get(DAY)).toBe(5);
  });

  it("counts a habit tap once beside those cups", async () => {
    await cupsLeftInTheOutbox();
    const { hook, habit } = await openHabits();
    act(() => hook.result.current.adjustToday(habit(), 1));
    await flush();
    locks.use(locks.client());
    renderHook(() => useHydration(focusArgs));
    await flush();
    expect(cloud.days.get(DAY)).toBe(6);
  });

  it("hands over the outbox when the network comes back", async () => {
    const { hook } = await openHabits();
    localStorage.setItem(
      `bookmarkdeck:focus:hydration-outbox:v1:${EMAIL}:x`,
      JSON.stringify({ day: DAY, delta: 1, at: 1 })
    );
    act(() => void window.dispatchEvent(new Event("online")));
    await flush();
    expect(cloud.days.get(DAY)).toBe(1);
    hook.unmount();
    localStorage.setItem(
      `bookmarkdeck:focus:hydration-outbox:v1:${EMAIL}:y`,
      JSON.stringify({ day: DAY, delta: 1, at: 2 })
    );
    act(() => void window.dispatchEvent(new Event("online")));
    await flush();
    expect(cloud.days.get(DAY)).toBe(1); // unsubscribed: no longer listening
  });
});
