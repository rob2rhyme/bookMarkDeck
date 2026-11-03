import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { MilestoneRow } from "@/components/MilestoneRow";
import { SETTLE_MS } from "@/lib/useMilestoneCelebration";

const KEY = "bd:milestones:seen:v1:me@example.com";

const row = (metrics: Record<string, number>, ready = true, account: string | null = "me@example.com") => (
  <MilestoneRow metrics={metrics} celebrate={{ account, ready }} />
);
const settle = () => act(() => vi.advanceTimersByTime(SETTLE_MS + 50));

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("MilestoneRow celebration", () => {
  it("says nothing the first time, however much is already earned", () => {
    render(row({ "focus-streak": 30, bookmarks: 120 }));
    settle();
    expect(screen.queryByRole("status")).toBeNull();
    // ...but the badges themselves are there, and it remembers what it saw.
    expect(screen.getByLabelText("Milestones earned")).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "[]")).toContain("focus-streak-30");
  });

  it("celebrates a rung crossed after that, once, and a reload doesn't repeat it", () => {
    window.localStorage.setItem(KEY, JSON.stringify(["focus-streak-3"]));
    const { unmount } = render(row({ "focus-streak": 7 }));
    settle();
    const card = screen.getByRole("status");
    expect(card.textContent).toContain("New milestone: 7-day focus streak");
    fireEvent.click(screen.getByRole("button", { name: "Nice" }));
    expect(screen.queryByRole("status")).toBeNull();
    unmount();

    render(row({ "focus-streak": 7 }));
    settle();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("waits for the numbers to hold still: a count that is still loading celebrates nothing", () => {
    window.localStorage.setItem(KEY, JSON.stringify(["bookmarks-25"]));
    const { rerender } = render(row({ bookmarks: 30 }));
    act(() => vi.advanceTimersByTime(SETTLE_MS - 500));
    rerender(row({ bookmarks: 60 })); // the list kept loading: 50 crossed on the way
    act(() => vi.advanceTimersByTime(SETTLE_MS - 500));
    expect(screen.queryByRole("status")).toBeNull(); // still waiting; the timer restarted
    settle();
    expect(screen.getByRole("status").textContent).toContain("50 bookmarks saved");
  });

  it("does nothing until the page says it has loaded, or without an account", () => {
    window.localStorage.setItem(KEY, JSON.stringify(["focus-streak-3"]));
    const { rerender } = render(row({ "focus-streak": 7 }, false));
    settle();
    expect(screen.queryByRole("status")).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBe(JSON.stringify(["focus-streak-3"]));
    rerender(row({ "focus-streak": 7 }, true, null));
    settle();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders nothing at all below the first rung", () => {
    const { container } = render(row({ "focus-streak": 1 }));
    settle();
    expect(container.textContent).toBe("");
  });
});
