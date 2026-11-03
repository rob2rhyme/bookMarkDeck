import { beforeEach, describe, expect, it, vi } from "vitest";

const cap = vi.hoisted(() => ({ native: true }));
const plugin = vi.hoisted(() => ({
  schedule: vi.fn(async () => ({ notifications: [] })),
  cancel: vi.fn(async () => {}),
  checkPermissions: vi.fn(async () => ({ display: "granted" })),
  requestPermissions: vi.fn(async () => ({ display: "granted" })),
}));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => cap.native } }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: plugin }));

import {
  nativeRemindersAvailable,
  requestNativeReminderPermission,
  resetNativeRemindersForTests,
  syncNativeReminders,
} from "@/features/inventory/lib/nativeReminders";

const plan = [
  { id: 101, at: 1_800_000_000_000, title: "Use by in 3 days", body: "Milk" },
  { id: 102, at: 1_800_100_000_000, title: "Upkeep due tomorrow", body: "Boiler" },
];

beforeEach(() => {
  cap.native = true;
  resetNativeRemindersForTests();
  Object.values(plugin).forEach((f) => f.mockClear());
  plugin.checkPermissions.mockResolvedValue({ display: "granted" });
  plugin.requestPermissions.mockResolvedValue({ display: "granted" });
  plugin.schedule.mockResolvedValue({ notifications: [] });
  plugin.cancel.mockResolvedValue(undefined);
});

describe("on the plain web", () => {
  it("is unavailable and touches nothing", async () => {
    cap.native = false;
    expect(await nativeRemindersAvailable()).toBe(false);
    expect(await syncNativeReminders(plan, [5, 6])).toEqual([5, 6]); // left as it was
    expect(await requestNativeReminderPermission()).toBe(false);
    expect(plugin.schedule).not.toHaveBeenCalled();
    expect(plugin.cancel).not.toHaveBeenCalled();
  });
});

describe("in the native app", () => {
  it("is available", async () => {
    expect(await nativeRemindersAvailable()).toBe(true);
  });

  it("cancels what it scheduled last time, then schedules the plan at its times", async () => {
    const ids = await syncNativeReminders(plan, [7, 8]);
    expect(ids).toEqual([101, 102]);
    expect(plugin.cancel).toHaveBeenCalledWith({ notifications: [{ id: 7 }, { id: 8 }] });
    const sent = (plugin.schedule.mock.calls[0] as unknown as [{ notifications: { id: number; title: string; body: string; schedule: { at: Date } }[] }])[0];
    expect(sent.notifications.map((n) => [n.id, n.title, n.body, n.schedule.at.getTime()])).toEqual([
      [101, "Use by in 3 days", "Milk", 1_800_000_000_000],
      [102, "Upkeep due tomorrow", "Boiler", 1_800_100_000_000],
    ]);
    // Cancel happens before schedule, so a replan can't cancel what it just set.
    expect(plugin.cancel.mock.invocationCallOrder[0]).toBeLessThan(plugin.schedule.mock.invocationCallOrder[0]);
  });

  it("only cancels the ids it scheduled — never other pending notifications", async () => {
    await syncNativeReminders(plan, []);
    expect(plugin.cancel).not.toHaveBeenCalled();
  });

  it("an empty plan just clears, without asking for permission", async () => {
    expect(await syncNativeReminders([], [7])).toEqual([]);
    expect(plugin.cancel).toHaveBeenCalledWith({ notifications: [{ id: 7 }] });
    expect(plugin.checkPermissions).not.toHaveBeenCalled();
    expect(plugin.schedule).not.toHaveBeenCalled();
  });

  it("schedules nothing without permission, and remembers nothing", async () => {
    plugin.checkPermissions.mockResolvedValue({ display: "denied" });
    expect(await syncNativeReminders(plan, [7])).toEqual([]);
    expect(plugin.cancel).toHaveBeenCalled();
    expect(plugin.schedule).not.toHaveBeenCalled();
  });

  it("survives the plugin failing — nothing remembered, no throw", async () => {
    plugin.schedule.mockRejectedValue(new Error("not implemented"));
    await expect(syncNativeReminders(plan, [])).resolves.toEqual([]);
  });
});

describe("requestNativeReminderPermission", () => {
  it("is true without asking when already granted", async () => {
    expect(await requestNativeReminderPermission()).toBe(true);
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
  });

  it("is false without asking when the user has already refused (the system won't ask again)", async () => {
    plugin.checkPermissions.mockResolvedValue({ display: "denied" });
    expect(await requestNativeReminderPermission()).toBe(false);
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
  });

  it("asks when it hasn't been asked, and reports the answer", async () => {
    plugin.checkPermissions.mockResolvedValue({ display: "prompt" });
    expect(await requestNativeReminderPermission()).toBe(true);
    plugin.requestPermissions.mockResolvedValue({ display: "denied" });
    expect(await requestNativeReminderPermission()).toBe(false);
  });
});
