import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Signed in but offline, Firestore holds a write in this tab's memory until the
// server has it, so its promise never settles — and a tab closed meanwhile lost
// it. The next load's snapshot put the old copy back, brought a deleted habit
// back, or (habits keep no record of what the cloud had) dropped a new one. Each
// change is now queued first and sent again on the next load.
vi.mock("@/features/focus/data/focusData", async () => ({
  ...(await import("@/test/hydrationCloud")).hydrationData(),
  subscribeNotes: () => () => {},
  subscribeMeditationSessions: () => () => {},
  subscribeSessions: () => () => {},
  subscribeResets: () => () => {},
}));
vi.mock("@/features/inventory/data/inventoryData", () => ({ subscribeItems: () => () => {} }));
const habitData = vi.hoisted(() => ({
  deleteEntry: vi.fn(),
  deleteHabit: vi.fn(),
  fetchEntries: vi.fn(async () => []),
  fetchHabits: vi.fn(async () => []),
  saveEntry: vi.fn(),
  saveEntryCount: vi.fn(),
  saveHabit: vi.fn(),
  subscribeEntries: vi.fn(() => () => {}),
  subscribeHabits: vi.fn(() => () => {}),
}));
vi.mock("@/features/habits/data/habitData", () => habitData);
vi.mock("@/features/focus/lib/sound", () => ({ playChime: vi.fn() }));
vi.mock("@/features/focus/lib/notify", () => ({ notify: vi.fn() }));

import { pendingUpsertIds } from "@/utils/pendingDeletes";
import { useHabits } from "./useHabits";

const EMAIL = "a@example.com";
const habit = (id: string, name: string, sortOrder: number) => ({
  id,
  name,
  type: "binary",
  schedule: { type: "daily" },
  sortOrder,
});
const never = () => new Promise<never>(() => {});
const writes = [habitData.saveHabit, habitData.deleteHabit, habitData.saveEntry, habitData.deleteEntry];

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(
    `bookmarkdeck:habits:v1:${EMAIL}`,
    JSON.stringify([habit("H1", "Stretch", 0), habit("H2", "Floss", 1)])
  );
  writes.forEach((w) => w.mockReset().mockImplementation(never));
  habitData.subscribeHabits.mockClear();
});

describe("useHabits — signed in, offline, tab closed", () => {
  it("a create, a rename, a tap and a delete are sent on the next load", async () => {
    const tab = renderHook(() => useHabits(EMAIL, true));
    await waitFor(() => expect(tab.result.current.habits).toHaveLength(2));
    await waitFor(() => expect(habitData.subscribeHabits).toHaveBeenCalled());
    act(() => tab.result.current.addHabit(habit("H3", "Walk", 2) as never));
    act(() => tab.result.current.updateHabit({ ...tab.result.current.habits.find((h) => h.id === "H1")!, name: "Stretch more" }));
    act(() => tab.result.current.toggleToday(tab.result.current.habits.find((h) => h.id === "H1")!));
    act(() => tab.result.current.removeHabit("H2"));
    tab.unmount();

    writes.forEach((w) => w.mockReset().mockResolvedValue(undefined));
    renderHook(() => useHabits(EMAIL, true));
    await waitFor(() => expect(habitData.subscribeHabits).toHaveBeenCalledTimes(2));
    expect(habitData.deleteHabit).toHaveBeenCalledWith(EMAIL, "H2");
    const saved = habitData.saveHabit.mock.calls.map(([, h]) => [h.id, h.name]);
    expect(saved).toEqual(expect.arrayContaining([["H1", "Stretch more"], ["H3", "Walk"]]));
    expect(habitData.saveEntry).toHaveBeenCalledWith(EMAIL, expect.objectContaining({ habitId: "H1", status: "done" }));
    expect(pendingUpsertIds("habits", EMAIL).size).toBe(0);
    expect(pendingUpsertIds("habitEntries", EMAIL).size).toBe(0);
  });
});
