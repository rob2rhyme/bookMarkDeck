import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const native = vi.hoisted(() => ({
  available: vi.fn(async () => true),
  sync: vi.fn(async (plan: { id: number }[]) => plan.map((r) => r.id)),
}));
vi.mock("@/features/inventory/lib/nativeReminders", () => ({
  nativeRemindersAvailable: native.available,
  syncNativeReminders: native.sync,
}));

import { useLocalReminders, useLocalReminderSetting } from "@/features/inventory/hooks/useLocalReminders";
import type { InventoryItem } from "@/features/inventory/lib/types";

const milk = { id: "m", name: "Milk", quantity: 1, tags: [], links: [], photos: [], useBy: "2099-06-20" } as unknown as InventoryItem;
const base = { email: "me@example.com", today: "2026-11-03", nameItems: true, ready: true };
const IDS = "bd:inventory:local-reminder-ids:v1:me@example.com";

const settle = () => act(async () => {});

beforeEach(() => {
  window.localStorage.clear();
  native.available.mockClear().mockResolvedValue(true);
  native.sync.mockClear().mockImplementation(async (plan) => plan.map((r) => r.id));
});

describe("useLocalReminders", () => {
  it("schedules the plan once, and remembers the ids it set", async () => {
    const { rerender } = renderHook((p) => useLocalReminders(p), { initialProps: { ...base, enabled: true, items: [milk] } });
    await waitFor(() => expect(native.sync).toHaveBeenCalledTimes(1));
    const [plan, previous] = native.sync.mock.calls[0] as unknown as [{ id: number; title: string }[], number[]];
    expect(plan).toHaveLength(1);
    expect(plan[0].title).toBe("Use by in 3 days");
    expect(previous).toEqual([]);
    await settle();
    expect(JSON.parse(window.localStorage.getItem(IDS)!)).toEqual([plan[0].id]);

    // The same plan again — a re-render, a new array with the same items — sends nothing.
    rerender({ ...base, enabled: true, items: [{ ...milk }] });
    await settle();
    expect(native.sync).toHaveBeenCalledTimes(1);
  });

  it("clears what it scheduled when switched off", async () => {
    const { rerender } = renderHook((p) => useLocalReminders(p), { initialProps: { ...base, enabled: true, items: [milk] } });
    await waitFor(() => expect(native.sync).toHaveBeenCalledTimes(1));
    await settle();
    const id = JSON.parse(window.localStorage.getItem(IDS)!)[0];

    rerender({ ...base, enabled: false, items: [milk] });
    await waitFor(() => expect(native.sync).toHaveBeenCalledTimes(2));
    expect(native.sync).toHaveBeenLastCalledWith([], [id]);
    await settle();
    expect(window.localStorage.getItem(IDS)).toBeNull();
  });

  it("replans when a date changes", async () => {
    const { rerender } = renderHook((p) => useLocalReminders(p), { initialProps: { ...base, enabled: true, items: [milk] } });
    await waitFor(() => expect(native.sync).toHaveBeenCalledTimes(1));
    rerender({ ...base, enabled: true, items: [{ ...milk, useBy: "2099-07-20" } as InventoryItem] });
    await waitFor(() => expect(native.sync).toHaveBeenCalledTimes(2));
  });

  it("waits until My Stuff has loaded", async () => {
    renderHook(() => useLocalReminders({ ...base, enabled: true, items: [milk], ready: false }));
    await settle();
    expect(native.sync).not.toHaveBeenCalled();
  });

  it("keeps names off a locked phone", async () => {
    renderHook(() => useLocalReminders({ ...base, enabled: true, items: [milk], nameItems: false }));
    await waitFor(() => expect(native.sync).toHaveBeenCalled());
    const [plan] = native.sync.mock.calls[0] as unknown as [{ body: string }[]];
    expect(plan[0].body).toBe("Open My Stuff to see which.");
  });

  it("does nothing, and stores nothing, outside the native app", async () => {
    native.available.mockResolvedValue(false);
    renderHook(() => useLocalReminders({ ...base, enabled: true, items: [milk] }));
    await settle();
    expect(native.sync).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(IDS)).toBeNull();
  });
});

describe("useLocalReminderSetting", () => {
  it("is off until switched on, kept per account on this device", () => {
    const { result } = renderHook(() => useLocalReminderSetting("me@example.com"));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem("bd:inventory:local-reminders:v1:me@example.com")).toBe("1");

    const other = renderHook(() => useLocalReminderSetting("other@example.com"));
    expect(other.result.current[0]).toBe(false);

    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem("bd:inventory:local-reminders:v1:me@example.com")).toBeNull();
  });
});
