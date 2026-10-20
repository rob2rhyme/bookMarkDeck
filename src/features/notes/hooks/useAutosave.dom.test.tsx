import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAutosave } from "./useAutosave";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useAutosave", () => {
  it("debounces: one save 800 ms after the LAST change, with the latest draft", async () => {
    let draft = "a";
    const saved: string[] = [];
    const { result, rerender } = renderHook(() => useAutosave(async () => void saved.push(draft)));
    act(() => result.current.schedule());
    act(() => vi.advanceTimersByTime(500));
    draft = "ab";
    rerender();
    act(() => result.current.schedule());
    expect(result.current.status).toBe("pending");
    act(() => vi.advanceTimersByTime(799));
    expect(saved).toEqual([]);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(saved).toEqual(["ab"]);
    expect(result.current.status).toBe("saved");
  });

  it("reports a failed save, and saveNow retries", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("too big")).mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave(save));
    act(() => result.current.schedule());
    await act(async () => {
      vi.advanceTimersByTime(800);
    });
    expect(result.current.status).toBe("error");
    await act(async () => {
      await result.current.saveNow();
    });
    expect(result.current.status).toBe("saved");
  });

  it("flush saves only when something is pending", async () => {
    const save = vi.fn(async () => {});
    const { result } = renderHook(() => useAutosave(save));
    expect(result.current.flush()).toBe(false);
    act(() => result.current.schedule());
    await act(async () => {
      expect(result.current.flush()).toBe(true);
    });
    expect(save).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(2000));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("saves a pending change on unmount — leaving inside the debounce loses nothing", () => {
    const save = vi.fn(async () => {});
    const { result, unmount } = renderHook(() => useAutosave(save));
    act(() => result.current.schedule());
    unmount();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
