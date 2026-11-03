import { afterEach, describe, expect, it, vi } from "vitest";

import { untilAnswered } from "./untilAnswered";

afterEach(() => vi.useRealTimers());

describe("untilAnswered", () => {
  it("returns the first answer", async () => {
    await expect(untilAnswered(async () => 7, () => false)).resolves.toBe(7);
  });

  it("asks again when the browser comes back online", async () => {
    const fetch = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue("server");
    const run = untilAnswered(fetch, () => false, 60_000);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event("online"));
    await expect(run).resolves.toBe("server");
  });

  it("asks again on a timer, since an outage fires no online event", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValue("server");
    const run = untilAnswered(fetch, () => false, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(run).resolves.toBe("server");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("stops once cancelled", async () => {
    let cancelled = false;
    const fetch = vi.fn(async () => {
      throw new Error("offline");
    });
    const run = untilAnswered(fetch, () => cancelled, 60_000);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    cancelled = true;
    window.dispatchEvent(new Event("online"));
    await expect(run).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
