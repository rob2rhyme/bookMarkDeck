import { describe, it, expect, vi, afterEach } from "vitest";
import { createRateLimiter } from "./rateLimit";

describe("createRateLimiter", () => {
  afterEach(() => vi.useRealTimers());

  it("allows up to max within the window, then blocks (429 path)", () => {
    const limited = createRateLimiter(1000, 3);
    expect(limited("a")).toBe(false);
    expect(limited("a")).toBe(false);
    expect(limited("a")).toBe(false);
    expect(limited("a")).toBe(true); // 4th within window → blocked
    expect(limited("a")).toBe(true);
  });

  it("tracks keys independently", () => {
    const limited = createRateLimiter(1000, 1);
    expect(limited("userA")).toBe(false);
    expect(limited("userB")).toBe(false); // different key, own budget
    expect(limited("userA")).toBe(true);
  });

  it("frees capacity once the window elapses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const limited = createRateLimiter(1000, 1);
    expect(limited("a")).toBe(false);
    expect(limited("a")).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(limited("a")).toBe(false); // window passed, capacity restored
  });
});
