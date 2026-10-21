import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

/**
 * The bug this covers was invisible to every pure-logic test, because it lived
 * in what the hook REPORTS rather than in any calculation.
 *
 * `pushSupported()` is false when the deployment has no VAPID key — scheduling
 * is then a permanent no-op. The hook checked only `typeof Notification`, so on
 * such a deployment it reported "default", the dashboards offered "Turn on
 * reminders", and clicking it raised a real browser permission prompt to reach
 * a no-op. The user granted notifications and no reminder could ever arrive,
 * with nothing in the UI saying so.
 *
 * Both directions are asserted: unsupported must not prompt, and supported must
 * still work — a gate that is simply always-off would "fix" the bug by breaking
 * the feature, and would pass a one-sided test.
 */

const pushSupported = vi.fn();
vi.mock("@/lib/push", () => ({
  pushSupported: () => pushSupported(),
  schedulePush: vi.fn().mockResolvedValue("push-id"),
  cancelPush: vi.fn().mockResolvedValue(undefined),
  // The real one prompts once via Notification.requestPermission; delegating to
  // the stub below keeps "prompted exactly once" an assertion about the hook.
  requestPushPermission: async () =>
    (await Notification.requestPermission()) === "granted",
}));

const snoozes = vi.fn();
const clearSnooze = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/snoozeRecords", () => ({
  readSnoozes: () => snoozes(),
  clearSnooze: (tag: string) => clearSnooze(tag),
}));

import { cancelPush } from "@/lib/push";
import { useHabitReminders } from "./useHabitReminders";
import type { Habit, HabitStats } from "@/features/habits/lib/types";

// A real Habit, not a cast stub: the scheduling effect runs `nextReminderAt`,
// which reads `schedule`, so a thin object throws inside an effect and surfaces
// as an unhandled rejection rather than a failed assertion.
const makeHabit = (over: Partial<Habit> = {}): Habit => ({
  id: "h1",
  name: "Stretch",
  emoji: "\u{1F9D8}",
  hue: 200,
  type: "binary",
  schedule: { type: "daily" },
  reminder: "08:00",
  archived: false,
  sortOrder: 0,
  createdAt: null,
  ...over,
});

const habit = makeHabit();
const stats = new Map<string, HabitStats>();

const render = () =>
  renderHook(() => useHabitReminders("a@b.test", [habit], stats, "2026-01-01"));

let requestPermission: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  snoozes.mockReset().mockResolvedValue([]);
  clearSnooze.mockClear();
  vi.mocked(cancelPush).mockClear();
  requestPermission = vi.fn().mockResolvedValue("granted");
  vi.stubGlobal("Notification", {
    permission: "default",
    requestPermission,
  });
});

describe("useHabitReminders reports whether push can actually work", () => {
  it("says unsupported — and does NOT prompt — when push is not configured", async () => {
    pushSupported.mockReturnValue(false);
    const { result } = render();

    await waitFor(() => expect(result.current.permission).toBe("unsupported"));

    await act(async () => {
      await result.current.requestPermission();
    });
    // The whole point: no permission prompt for a capability that cannot work.
    expect(requestPermission).not.toHaveBeenCalled();
    expect(result.current.permission).toBe("unsupported");
  });

  it("still reports the browser's permission when push IS configured", async () => {
    pushSupported.mockReturnValue(true);
    const { result } = render();

    await waitFor(() => expect(result.current.permission).toBe("default"));

    await act(async () => {
      await result.current.requestPermission();
    });
    expect(requestPermission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.permission).toBe("granted"));
  });

  it("never passes through 'unsupported' when push works", () => {
    // Regression guard for a flash introduced while fixing the bug above: the
    // hook used to initialise to "unsupported", so a deployment where push
    // works fine would paint the "not set up" line for one frame before the
    // effect corrected it.
    //
    // Asserting on the final value cannot see that — it is already "default"
    // by the time renderHook returns. So record what EVERY render saw: the
    // pre-effect state has to be a value the dashboards ignore, and must not
    // be the one that means "this deployment can't do reminders".
    pushSupported.mockReturnValue(true);
    const seen: string[] = [];
    renderHook(() => {
      const r = useHabitReminders("a@b.test", [habit], stats, "2026-01-01");
      seen.push(r.permission);
      return r;
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain("unsupported");
  });

  it("only surfaces reminder state for habits that actually set a reminder", () => {
    pushSupported.mockReturnValue(true);
    const bare = makeHabit({ id: "h2", name: "Read", reminder: null });
    const { result } = renderHook(() =>
      useHabitReminders("a@b.test", [bare], stats, "2026-01-01")
    );
    expect(result.current.hasReminders).toBe(false);
  });
});

// Tapping "Snooze 1 hour" queues a push from the service worker, which the page
// can't see being made. Without this sweep, finishing the habit would leave that
// push queued and the reminder would arrive for something already done.
describe("useHabitReminders and snoozed reminders", () => {
  const granted = () => {
    pushSupported.mockReturnValue(true);
    vi.stubGlobal("Notification", { permission: "granted", requestPermission });
  };
  const farFuture = () => Date.now() + 30 * 60_000;
  const run = (map = stats, habits = [habit]) =>
    renderHook(() => useHabitReminders("a@b.test", habits, map, "2026-01-01"));

  it("cancels a snoozed push once its habit is done", async () => {
    granted();
    snoozes.mockResolvedValue([{ tag: "habit:h1", messageId: "snz-1", fireAt: farFuture() }]);
    run(new Map([["h1", { doneToday: true } as HabitStats]]));
    await waitFor(() => expect(cancelPush).toHaveBeenCalledWith("snz-1"));
    expect(clearSnooze).toHaveBeenCalledWith("habit:h1");
  });

  it("leaves a pending snooze alone while the habit is still open", async () => {
    granted();
    snoozes.mockResolvedValue([{ tag: "habit:h1", messageId: "snz-1", fireAt: farFuture() }]);
    run();
    await new Promise((r) => setTimeout(r, 30));
    expect(cancelPush).not.toHaveBeenCalledWith("snz-1");
    expect(clearSnooze).not.toHaveBeenCalled();
  });

  it("drops a snooze that has already fired, and one for a deleted habit", async () => {
    granted();
    snoozes.mockResolvedValue([
      { tag: "habit:h1", messageId: "old", fireAt: Date.now() - 10 * 60_000 },
      { tag: "habit:gone", messageId: "snz-9", fireAt: farFuture() },
      { tag: "filing-digest", messageId: "not-ours", fireAt: farFuture() },
    ]);
    run();
    await waitFor(() => expect(cancelPush).toHaveBeenCalledWith("snz-9"));
    expect(clearSnooze).toHaveBeenCalledWith("habit:h1");
    expect(clearSnooze).toHaveBeenCalledWith("habit:gone");
    expect(cancelPush).not.toHaveBeenCalledWith("not-ours");
  });
});
