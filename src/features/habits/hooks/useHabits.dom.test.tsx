import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cloud } from "@/test/hydrationCloud";
import { webLocksMock, type LockManagerLike, type WebLocksMock } from "@/test/webLocksMock";

// A raiseOnly source's subscribe function, individually controllable per test
// (vi.fn, not a bare no-op) so a test can simulate another device's write.
const trackableData = vi.hoisted(() => ({
  subscribeNotes: vi.fn((_e: string, _cb: (notes: { day: string }[]) => void) => () => {}),
  subscribeMeditationSessions: vi.fn(
    (_e: string, _cb: (rows: { day: string; minutes: number }[]) => void) => () => {}
  ),
  subscribeSessions: vi.fn(
    (_e: string, _cb: (rows: { day: string; focusMin: number }[]) => void) => () => {}
  ),
  subscribeResets: vi.fn((_e: string, _cb: (rows: { day: string }[]) => void) => () => {}),
}));
vi.mock("@/features/focus/data/focusData", async () => ({
  ...(await import("@/test/hydrationCloud")).hydrationData(),
  ...trackableData,
}));
vi.mock("@/features/inventory/data/inventoryData", () => ({ subscribeItems: () => () => {} }));
// Hoisted, so every fresh copy of the hooks (one per tab) shares these fns.
const habitData = vi.hoisted(() => ({
  deleteEntry: vi.fn(async () => {}),
  deleteHabit: vi.fn(async () => {}),
  fetchEntries: vi.fn(async () => []),
  fetchHabits: vi.fn(async () => []),
  saveEntry: vi.fn(async () => {}),
  saveEntryCount: vi.fn(async () => {}),
  saveHabit: vi.fn(async () => {}),
  subscribeEntries: vi.fn((_e: string, _cb: (entries: HabitEntry[]) => void) => () => {}),
  subscribeHabits: () => () => {},
}));
vi.mock("@/features/habits/data/habitData", () => habitData);
vi.mock("@/features/focus/lib/sound", () => ({ playChime: vi.fn() }));
vi.mock("@/features/focus/lib/notify", () => ({ notify: vi.fn() }));

import { hydrationTransport } from "@/features/focus/data/focusData";
import type { Habit, HabitEntry } from "@/features/habits/lib/types";

// A tab is its own copy of a hook and of the outbox under it, as in a browser:
// a Focus tab and a habits tab share only localStorage, the locks and the cloud.
async function habitsTab() {
  vi.resetModules();
  return (await import("./useHabits")).useHabits;
}
async function focusTab() {
  vi.resetModules();
  return (await import("@/features/focus/hooks/useHydration")).useHydration;
}

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
  habitData.saveEntry.mockClear();
  habitData.saveEntryCount.mockClear();
  locks = webLocksMock();
  page = locks.client();
  locks.use(page);
});
afterEach(() => {
  locks.uninstall();
  vi.useRealTimers();
});

async function openHabits() {
  const useHabits = await habitsTab();
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

  // Undo takes back the tap, not the cups adopted from elsewhere since: it
  // used to write the count from before the tap, erasing them.
  it("undoes only the tap when cups were added elsewhere since", async () => {
    cloud.write(DAY, 3);
    const { hook, habit, count } = await openHabits();
    act(() => hook.result.current.adjustToday(habit(), 1));
    await flush();
    act(() => cloud.add(DAY, 2)); // the phone
    await flush();
    expect(count()).toBe(6);
    act(() => hook.result.current.undoToday(habit()));
    await flush();
    expect(cloud.days.get(DAY)).toBe(5);
    expect(count()).toBe(5);
  });

  // With no entry before the tap, there is no note or time to put back —
  // only the cups another device still holds, and that device's own cups
  // never carried the undone log's note.
  it("undoes a log made on an empty day without keeping its note or time", async () => {
    const { hook, habit, count } = await openHabits();
    act(() =>
      hook.result.current.logDetail(habit(), { status: "done", count: 2, note: "after run", at: "07:00" })
    );
    await flush();
    act(() => cloud.add(DAY, 1)); // the phone, no note of its own
    await flush();
    expect(count()).toBe(3);
    act(() => hook.result.current.undoToday(habit()));
    await flush();
    expect(cloud.days.get(DAY)).toBe(1);
    expect(count()).toBe(1);
    const e = hook.result.current.todayEntry("w");
    expect(e).toMatchObject({ status: "done", count: 1 });
    expect(e?.note).toBeUndefined();
    expect(e?.at).toBeUndefined();
  });

  it("undoes only the tap when cups were removed elsewhere since", async () => {
    cloud.write(DAY, 5);
    const { hook, habit } = await openHabits();
    act(() => hook.result.current.adjustToday(habit(), 1));
    await flush();
    act(() => cloud.add(DAY, -3)); // the phone
    await flush();
    act(() => hook.result.current.undoToday(habit()));
    await flush();
    expect(cloud.days.get(DAY)).toBe(2);
  });

  it("undoes a toggle by taking back the cups it added", async () => {
    const { hook, habit, count } = await openHabits();
    act(() => hook.result.current.adjustToday(habit(), 2));
    act(() => hook.result.current.toggleToday(habit()));
    act(() => hook.result.current.undoToday(habit()));
    await flush();
    expect(sent()).toEqual([2, 6, -6]);
    expect(count()).toBe(2);
  });

  it("undoes a tap whose cups are already gone as nothing", async () => {
    cloud.write(DAY, 3);
    const { hook, habit, count } = await openHabits();
    act(() => hook.result.current.adjustToday(habit(), 1));
    await flush();
    act(() => cloud.add(DAY, -4)); // the phone takes everything off
    await flush();
    act(() => hook.result.current.undoToday(habit()));
    await flush();
    expect(sent()).toEqual([1]);
    expect(cloud.days.get(DAY)).toBe(0);
    expect(count()).toBe(0);
  });

  // Only the count is computed from the change: the rest of the entry — its
  // note, time and when it was made — is the one from before the tap.
  it("puts back the note and time from before the tap it undoes", async () => {
    const { hook, habit } = await openHabits();
    act(() =>
      hook.result.current.logDetail(habit(), { status: "done", count: 4, note: "with lemon", at: "08:30" })
    );
    const before = hook.result.current.todayEntry("w");
    act(() =>
      hook.result.current.logDetail(habit(), { status: "done", count: 5, note: "plain", at: "09:00" })
    );
    act(() => hook.result.current.undoToday(habit()));
    await flush();
    expect(sent()).toEqual([4, 1, -1]);
    expect(hook.result.current.todayEntry("w")).toEqual({ ...before, count: 4 });
  });

  it("puts back the note after undoing a skip, with a cup from elsewhere since", async () => {
    const { hook, habit, count } = await openHabits();
    act(() =>
      hook.result.current.logDetail(habit(), { status: "done", count: 4, note: "with lemon", at: "08:30" })
    );
    const before = hook.result.current.todayEntry("w");
    act(() => hook.result.current.skipToday(habit()));
    await flush();
    act(() => cloud.add(DAY, 1)); // the phone
    await flush();
    expect(count()).toBe(1);
    act(() => hook.result.current.undoToday(habit()));
    await flush();
    expect(cloud.days.get(DAY)).toBe(5);
    expect(hook.result.current.todayEntry("w")).toEqual({ ...before, count: 5 });
  });

  // The bare-base fallback (for a tap on an empty day) assumed `current` at
  // undo time could only ever be the tap's own entry, adoption's count aside.
  // The cloud entries subscription (commitEntries) can instead replace it
  // wholesale with a DIFFERENT device's genuinely new entry — its own note,
  // clock time and createdAt — and undo's bare base used to discard that.
  it("keeps a different device's note and time instead of the bare base it would otherwise fall back to", async () => {
    let deliver: (entries: HabitEntry[]) => void = () => {};
    habitData.subscribeEntries.mockImplementationOnce((_e, cb) => {
      deliver = cb;
      return () => {};
    });
    const { hook, habit, count } = await openHabits();
    act(() => hook.result.current.adjustToday(habit(), 1)); // on an empty day
    await flush();
    expect(count()).toBe(1);
    const deviceB: HabitEntry = {
      id: `w_${DAY}`,
      habitId: "w",
      day: DAY,
      status: "done",
      count: 3,
      note: "from device B",
      at: "08:15",
      createdAt: "2026-10-11T08:15:00.000Z",
    };
    act(() => {
      deliver([deviceB]);
      cloud.write(DAY, 3);
    });
    await flush();
    expect(hook.result.current.todayEntry("w")).toEqual(deviceB);
    act(() => hook.result.current.undoToday(habit()));
    await flush();
    expect(hook.result.current.todayEntry("w")).toMatchObject({
      count: 2,
      note: "from device B",
      at: "08:15",
      createdAt: "2026-10-11T08:15:00.000Z",
    });
  });

  // A tap made under one link is undone under that link or not at all: undone
  // as a change to Focus after linking, it took back cups it never sent.
  it("doesn't undo a tap made before the habit was linked", async () => {
    localStorage.setItem(
      `bookmarkdeck:habits:v1:${EMAIL}`,
      JSON.stringify([{ ...water, linkedSourceId: "none" }])
    );
    cloud.write(DAY, 3);
    const { hook, habit, count } = await openHabits();
    act(() => hook.result.current.adjustToday(habit(), 2));
    act(() => hook.result.current.updateHabit({ ...habit(), linkedSourceId: undefined }));
    await flush();
    expect(count()).toBe(3); // linking makes today's count Focus's
    expect(hook.result.current.undoableIds.has("w")).toBe(false);
    act(() => hook.result.current.undoToday(habit()));
    await flush();
    expect(sent()).toEqual([]);
    expect(cloud.days.get(DAY)).toBe(3);
    expect(count()).toBe(3);
  });

  it("doesn't undo a tap sent to Focus after the habit was unlinked", async () => {
    cloud.write(DAY, 3);
    const { hook, habit, count } = await openHabits();
    act(() => hook.result.current.adjustToday(habit(), 1));
    await flush();
    expect(hook.result.current.undoableIds.has("w")).toBe(true);
    act(() => hook.result.current.updateHabit({ ...habit(), linkedSourceId: "none" }));
    expect(hook.result.current.undoableIds.has("w")).toBe(false);
    act(() => hook.result.current.undoToday(habit()));
    await flush();
    expect(sent()).toEqual([1]);
    expect(cloud.days.get(DAY)).toBe(4);
    expect(count()).toBe(4);
  });

  // This copy of the entry can be older than the cloud's — the hydration
  // listener opens before the entries one — so an adoption writes only the
  // count: the whole entry erased a note and time logged on another device.
  it("writes only the count when it adopts a cup from elsewhere", async () => {
    cloud.write(DAY, 3);
    const { count } = await openHabits();
    expect(count()).toBe(3);
    act(() => cloud.add(DAY, 1));
    await flush();
    expect(count()).toBe(4);
    expect(habitData.saveEntry).not.toHaveBeenCalled();
    expect(habitData.saveEntryCount).toHaveBeenLastCalledWith(
      EMAIL,
      expect.objectContaining({ id: `w_${DAY}`, status: "done", count: 4 })
    );
  });

  it("writes only the count when it raises the habit from Focus's cache", async () => {
    localStorage.setItem(
      `bookmarkdeck:focus:hydration:v1:${EMAIL}`,
      JSON.stringify({ day: DAY, cups: 2, lastDrink: 1 })
    );
    const { count } = await openHabits();
    expect(count()).toBe(2);
    expect(habitData.saveEntry).not.toHaveBeenCalled();
    expect(habitData.saveEntryCount).toHaveBeenCalledWith(
      EMAIL,
      expect.objectContaining({ status: "done", count: 2 })
    );
  });

  // Queued while not connected, an adopted count went up as the whole entry on
  // connect, and erased a note logged on another device. Linked, the habit
  // takes the record's count again once connected, so there's nothing to send.
  // A count adopted while not connected must still reach the cloud once
  // connected — through saveEntryCount, never saveEntry: the generic pending-
  // upsert path (queued under "habitEntries") uploads with saveEntry, which
  // would write back the note and time this device cached, undoing the fix
  // above. It used to queue nothing at all, so the adoption was lost the
  // moment a cloud entries snapshot replaced local state with the cloud's
  // (which had never heard of it) — see the next test for a day it's lost on.
  it("uploads a count adopted while not connected, through saveEntryCount only", async () => {
    localStorage.setItem(
      `bookmarkdeck:focus:hydration:v1:${EMAIL}`,
      JSON.stringify({ day: DAY, cups: 2, lastDrink: 1 })
    );
    const useHabits = await habitsTab();
    const hook = renderHook(({ c }: { c: boolean }) => useHabits(EMAIL, c), {
      initialProps: { c: false },
    });
    await flush();
    expect(hook.result.current.todayEntry("w")).toMatchObject({ status: "done", count: 2 });
    expect(habitData.saveEntryCount).not.toHaveBeenCalled(); // queued, not sent, while offline
    hook.rerender({ c: true });
    await flush();
    expect(habitData.saveEntry).not.toHaveBeenCalled();
    expect(habitData.saveEntryCount).toHaveBeenCalledWith(
      EMAIL,
      expect.objectContaining({ id: `w_${DAY}`, status: "done", count: 2 })
    );
  });

  // The adoption's day can roll over to a past day before the device ever
  // connects — habits only re-adopts "today" live, so nothing else would ever
  // push this day's count, and the next connect's cloud snapshot (which never
  // heard of it) replaced local state wholesale and erased it outright.
  it("doesn't lose a count adopted on a day that rolled over before connecting", async () => {
    const YESTERDAY = "2026-10-10";
    vi.setSystemTime(new Date(2026, 9, 10, 9, 0)); // mount on YESTERDAY, offline
    localStorage.setItem(
      `bookmarkdeck:focus:hydration:v1:${EMAIL}`,
      JSON.stringify({ day: YESTERDAY, cups: 3, lastDrink: 1 })
    );
    const useHabits = await habitsTab();
    const hook = renderHook(({ c }: { c: boolean }) => useHabits(EMAIL, c), {
      initialProps: { c: false },
    });
    await flush();
    expect(hook.result.current.todayEntry("w")).toMatchObject({ status: "done", count: 3 });
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0)); // the day rolls over, still offline
    act(() => void window.dispatchEvent(new Event("focus")));
    await flush();
    hook.rerender({ c: true }); // then connects
    await flush();
    expect(habitData.saveEntryCount).toHaveBeenCalledWith(
      EMAIL,
      expect.objectContaining({ id: `w_${YESTERDAY}`, status: "done", count: 3 })
    );
    expect(habitData.saveEntry).not.toHaveBeenCalled();
  });

  // Entries from the cloud go through commitEntries too: set straight into
  // state, they never reached entriesRef, and the next tap — built on the ref —
  // dropped every one of them.
  it("keeps the entries a cloud snapshot brought in when the next tap lands", async () => {
    let deliver: (entries: HabitEntry[]) => void = () => {};
    habitData.subscribeEntries.mockImplementationOnce((_e, cb) => {
      deliver = cb;
      return () => {};
    });
    const { hook, habit } = await openHabits();
    const yesterday: HabitEntry = {
      id: "w_2026-10-10",
      habitId: "w",
      day: "2026-10-10",
      status: "done",
      count: 6,
      createdAt: null,
    };
    act(() => deliver([yesterday]));
    act(() => hook.result.current.adjustToday(habit(), 1));
    await flush();
    expect(hook.result.current.entries).toContainEqual(yesterday);
    expect(hook.result.current.todayEntry("w")).toMatchObject({ count: 1 });
  });

  it("keeps a logged note and time when it raises the habit from Focus's cache", async () => {
    const logged: HabitEntry = {
      id: `w_${DAY}`,
      habitId: "w",
      day: DAY,
      status: "done",
      count: 2,
      note: "with lemon",
      at: "08:30",
      createdAt: "2026-10-11T08:30:00.000Z",
    };
    localStorage.setItem(`bookmarkdeck:habit-entries:v1:${EMAIL}`, JSON.stringify([logged]));
    localStorage.setItem(
      `bookmarkdeck:focus:hydration:v1:${EMAIL}`,
      JSON.stringify({ day: DAY, cups: 5, lastDrink: 1 })
    );
    const useHabits = await habitsTab();
    const hook = renderHook(() => useHabits(EMAIL, false));
    await flush();
    expect(hook.result.current.todayEntry("w")).toEqual({ ...logged, count: 5 });
  });

  it("keeps a logged note and time when it adopts a cup from elsewhere", async () => {
    cloud.write(DAY, 3);
    const { hook, habit, count } = await openHabits();
    act(() =>
      hook.result.current.logDetail(habit(), { status: "done", count: 4, note: "with lemon", at: "08:30" })
    );
    await flush();
    act(() => cloud.add(DAY, 1));
    await flush();
    expect(count()).toBe(5);
    expect(hook.result.current.todayEntry("w")).toMatchObject({ note: "with lemon", at: "08:30" });
  });

  it("counts two taps in one batch from each other", async () => {
    cloud.write(DAY, 3);
    const { hook, habit, count } = await openHabits();
    act(() => {
      hook.result.current.adjustToday(habit(), 1);
      hook.result.current.adjustToday(habit(), 1);
    });
    expect(count()).toBe(5);
    await flush();
    expect(sent()).toEqual([1, 1]);
    expect(cloud.days.get(DAY)).toBe(5);
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
    const useHydration = await focusTab();
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
    const useHydration = await focusTab();
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
    const useHydration = await focusTab();
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

// A plain tap used to rebuild today's entry from scratch, dropping a note or
// time already on it; and an undo on a raise-only linked habit (journal,
// meditation, focus, declutter) used to restore the pre-tap snapshot
// absolutely, erasing a count a different device raised meanwhile — the same
// bug class already fixed for the bidirectional/water link above.
describe("useHabits — own taps and raise-only undo", () => {
  it("doesn't drop a note when a plain +/- tap rebuilds today's entry", async () => {
    const { hook, habit } = await openHabits();
    act(() => hook.result.current.adjustToday(habit(), 1));
    act(() =>
      hook.result.current.logDetail(habit(), { status: "done", count: 1, note: "felt great", at: "07:00" })
    );
    await flush();
    expect(hook.result.current.todayEntry("w")?.note).toBe("felt great");
    act(() => hook.result.current.adjustToday(habit(), 1));
    await flush();
    expect(hook.result.current.todayEntry("w")?.note).toBe("felt great");
    expect(hook.result.current.todayEntry("w")?.at).toBe("07:00");
  });

  it("doesn't drop a note when toggling a habit done", async () => {
    const { hook, habit } = await openHabits();
    act(() => hook.result.current.logDetail(habit(), { status: "skipped", note: "resting" }));
    await flush();
    expect(hook.result.current.todayEntry("w")?.note).toBe("resting");
    act(() => hook.result.current.toggleToday(habit()));
    await flush();
    expect(hook.result.current.todayEntry("w")?.note).toBe("resting");
  });

  it("doesn't drop a note when skipping", async () => {
    const { hook, habit } = await openHabits();
    act(() =>
      hook.result.current.logDetail(habit(), { status: "done", count: 2, note: "logged early" })
    );
    await flush();
    act(() => hook.result.current.skipToday(habit()));
    await flush();
    expect(hook.result.current.todayEntry("w")?.note).toBe("logged early");
  });

  // A raise-only source (meditation, here) can push a habit's count up from a
  // DIFFERENT device's activity between a tap and its undo. Undo must take
  // back only the tap's own 5 minutes, not the 3 the other device logged.
  it("doesn't erase a raise-only source's adopted count when undoing a plain tap", async () => {
    const meditationHabit: Habit = {
      id: "m",
      name: "Meditate",
      emoji: "🧘",
      hue: 200,
      type: "measurable",
      unit: "min",
      target: 10,
      schedule: { type: "daily" },
      linkedSourceId: "meditation",
      archived: false,
      sortOrder: 0,
      createdAt: null,
    };
    localStorage.setItem(`bookmarkdeck:habits:v1:${EMAIL}`, JSON.stringify([meditationHabit]));
    const useHabits = await habitsTab();
    const hook = renderHook(() => useHabits(EMAIL, true));
    await flush();
    const habit = () => hook.result.current.habits.find((h) => h.id === "m") as Habit;

    act(() => hook.result.current.adjustToday(habit(), 5));
    await flush();
    expect(hook.result.current.todayEntry("m")).toMatchObject({ count: 5 });

    expect(trackableData.subscribeMeditationSessions).toHaveBeenCalled();
    const deliver = trackableData.subscribeMeditationSessions.mock.calls[0][1];
    act(() => deliver([{ day: DAY, minutes: 8 }])); // a different device, same day
    await flush();
    expect(hook.result.current.todayEntry("m")).toMatchObject({ count: 8 });

    act(() => hook.result.current.undoToday(habit()));
    await flush();
    expect(hook.result.current.todayEntry("m")).toMatchObject({ count: 3 });
  });
});

// Outside act, on React's own scheduler: a snapshot can land after a render has
// committed but before its effects ran. Those effects used to copy the
// rendered entries into entriesRef, over the newer count the snapshot had just
// written there — so the next snapshot was merged against a stale count.
describe("useHabits — snapshots between a render and its effects", () => {
  it("ends on the record's count", async () => {
    cloud.write(DAY, 3);
    const { count } = await openHabits();
    vi.useRealTimers();
    const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    env.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      const tick = () => new Promise<void>((r) => setImmediate(r));
      const settle = async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
      };
      cloud.write(DAY, 4); // a cup elsewhere: React schedules a render
      await settle();
      setImmediate(async () => {
        cloud.write(DAY, 5); // between that render's commit and its effects
        await settle();
        setImmediate(() => cloud.write(DAY, 4)); // and taken back
      });
      for (let i = 0; i < 20; i++) await tick();
    } finally {
      env.IS_REACT_ACT_ENVIRONMENT = true;
    }
    await flush();
    expect(cloud.days.get(DAY)).toBe(4);
    expect(count()).toBe(4);
  });
});
