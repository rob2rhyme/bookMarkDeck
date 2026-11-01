import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/focus/lib/sound", () => ({
  startAmbient: vi.fn(),
  stopAmbient: vi.fn(),
  setAmbientVolume: vi.fn(),
}));

import { setAmbientVolume, startAmbient, stopAmbient } from "@/features/focus/lib/sound";
import { useFocusAmbient } from "./useFocusAmbient";

beforeEach(() => vi.clearAllMocks());

describe("useFocusAmbient", () => {
  it("plays on the focus channel only while a block is running", () => {
    const { rerender } = renderHook(
      ({ active }) => useFocusAmbient(active, "rain", 60),
      { initialProps: { active: false } }
    );
    expect(startAmbient).not.toHaveBeenCalled();

    rerender({ active: true });
    expect(startAmbient).toHaveBeenCalledWith("rain", { channel: "focus", volume: 60 });

    // Pause, a break, time up: all arrive as active=false.
    rerender({ active: false });
    expect(stopAmbient).toHaveBeenCalledWith("focus");
  });

  it("never starts for 'off'", () => {
    renderHook(() => useFocusAmbient(true, "off", 50));
    expect(startAmbient).not.toHaveBeenCalled();
  });

  it("swaps when another soundscape is chosen mid-block", () => {
    const { rerender } = renderHook(({ id }) => useFocusAmbient(true, id, 50), {
      initialProps: { id: "rain" as "rain" | "wind" },
    });
    rerender({ id: "wind" });
    expect(stopAmbient).toHaveBeenCalledTimes(1);
    expect(startAmbient).toHaveBeenLastCalledWith("wind", { channel: "focus", volume: 50 });
  });

  it("moves the volume without restarting", () => {
    const { rerender } = renderHook(({ v }) => useFocusAmbient(true, "brown", v), {
      initialProps: { v: 50 },
    });
    vi.mocked(startAmbient).mockClear();
    vi.mocked(stopAmbient).mockClear();
    rerender({ v: 80 });
    expect(setAmbientVolume).toHaveBeenLastCalledWith(80, "focus");
    expect(startAmbient).not.toHaveBeenCalled();
    expect(stopAmbient).not.toHaveBeenCalled();
  });

  it("stops when the timer unmounts", () => {
    const { unmount } = renderHook(() => useFocusAmbient(true, "rain", 50));
    unmount();
    expect(stopAmbient).toHaveBeenCalledWith("focus");
  });
});
