import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock every side-effecting edge so the hook runs without Firebase, Web Audio,
// notifications, or the push/native layers.
vi.mock("@/features/focus/data/focusData", () => ({
  countSessionsForDay: vi.fn().mockResolvedValue(0),
  recordFocusSession: vi.fn().mockResolvedValue("session-id"),
  updateSessionMeta: vi.fn().mockResolvedValue(undefined),
}));
// Only the audio unlock is faked; the rest (ids, defaults the settings read) stays real.
vi.mock("@/features/focus/lib/sound", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/focus/lib/sound")>()),
  initAudio: vi.fn(),
}));
vi.mock("@/features/focus/lib/notify", () => ({
  notify: vi.fn(),
  requestNotificationPermission: vi.fn(),
}));
vi.mock("@/lib/push", () => ({
  schedulePush: vi.fn().mockResolvedValue("push-id"),
  cancelPush: vi.fn(),
}));
vi.mock("@/features/focus/lib/nativeNotify", () => ({
  ensureNativeNotifPermission: vi.fn(),
  scheduleNativeTimerAlert: vi.fn(),
  cancelNativeTimerAlert: vi.fn(),
}));

import { countSessionsForDay } from "@/features/focus/data/focusData";
import { DEFAULT_SETTINGS } from "@/features/focus/lib/settings";
import { useFocusTimer } from "./useFocusTimer";

const TIMER_KEY = "bookmarkdeck:focus:timer:v1";
const NOW = new Date("2026-01-01T12:00:00Z").getTime();

function seed(saved: Record<string, unknown>) {
  localStorage.setItem(TIMER_KEY, JSON.stringify(saved));
}

const render = () => renderHook(() => useFocusTimer({ settings: DEFAULT_SETTINGS }));

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * These cover the restore-from-localStorage paths, which are the reason the
 * ref-publishing effects must be declared ABOVE the restore effect that calls
 * them: both refs seed to a no-op, so publishing them too late means the restore
 * silently does nothing instead of resuming or completing the block.
 *
 * Written after a change to that ordering had to be verified by hand — see the
 * comment on `handleComplete` in useFocusTimer.ts.
 */
describe("useFocusTimer — restoring a persisted block", () => {
  it("completes a block that ended while away, rather than resuming it", () => {
    seed({
      mode: "focus",
      running: true,
      endTime: NOW - 5_000, // ended 5s before we came back
      secondsLeft: 0,
      pushId: null,
    });

    const { result } = render();

    // `alert` is set only by the real handleComplete — the seeded no-op leaves
    // it null, so this is the assertion that proves the ref was published.
    expect(result.current.alert).toBe("focus");
    // A finished focus block hands over to a short break, stopped (the default
    // settings do not auto-start breaks).
    expect(result.current.mode).toBe("short");
    expect(result.current.running).toBe(false);
    expect(result.current.completedToday).toBe(1);
  });

  it("resumes a block that still has time left, and keeps ticking", () => {
    seed({
      mode: "focus",
      running: true,
      endTime: NOW + 300_000, // 5 minutes left
      secondsLeft: 300,
      pushId: null,
    });

    const { result } = render();

    expect(result.current.running).toBe(true);
    expect(result.current.mode).toBe("focus");
    expect(result.current.alert).toBeNull();

    // `startWith` sets the end time and marks it running, but `secondsLeft`
    // only catches up on the first interval tick (250ms) — so advance before
    // reading it, or you get the untouched 25:00 default.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.secondsLeft).toBeLessThanOrEqual(300);

    const before = result.current.secondsLeft;
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    // The interval re-armed: the clock is actually counting down.
    expect(result.current.secondsLeft).toBeLessThan(before);
    expect(result.current.secondsLeft).toBeLessThanOrEqual(290);
  });

  it("restores a paused block without starting it", () => {
    seed({
      mode: "short",
      running: false,
      endTime: 0,
      secondsLeft: 120,
      pushId: null,
    });

    const { result } = render();

    expect(result.current.mode).toBe("short");
    expect(result.current.running).toBe(false);
    expect(result.current.secondsLeft).toBe(120);
  });

  it("starts clean when nothing is persisted", () => {
    const { result } = render();

    expect(result.current.mode).toBe("focus");
    expect(result.current.running).toBe(false);
    expect(result.current.secondsLeft).toBe(DEFAULT_SETTINGS.focus * 60);
    expect(result.current.alert).toBeNull();
  });

  it("ignores malformed persisted state instead of throwing", () => {
    localStorage.setItem(TIMER_KEY, "{not json");
    const { result } = render();
    expect(result.current.mode).toBe("focus");
    expect(result.current.running).toBe(false);
  });
});

// Sessions are stored under their LOCAL day. The day is no longer mocked: it
// used to be pinned here through focusData's own copy of todayKey, a pin no test
// actually reached. This reads the real one, in a zone where the UTC date and the
// local date differ — CI runs in UTC, where they never do.
describe("useFocusTimer — today's count", () => {
  const savedTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = savedTz;
  });

  it("reads the completed-block count for the LOCAL day", () => {
    process.env.TZ = "Pacific/Kiritimati"; // UTC+14: NOW is 02:00 on Jan 2 here
    renderHook(() =>
      useFocusTimer({ settings: DEFAULT_SETTINGS, email: "me@example.com", connected: true })
    );
    expect(countSessionsForDay).toHaveBeenCalledWith("me@example.com", "2026-01-02");
  });
});
