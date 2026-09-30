import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/filing/data/filingData", () => ({
  deleteFolder: vi.fn(),
  fetchFolders: vi.fn(async () => []),
  saveFolder: vi.fn(async () => {}),
  subscribeFolders: vi.fn(() => () => {}),
}));

import { useFilingFolders } from "./useFilingFolders";

// takenAt is a local day (custody's "out N days" counts from it), but it was
// stamped with the UTC date: a check-out on a US evening read "out -1 days".
// CI runs in UTC, where the two agree, so this pins a zone and a clock.
describe("useFilingFolders — check-out day", () => {
  const saved = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "America/Los_Angeles";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T03:00:00.000Z")); // 8pm, Sep 30
  });
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = saved;
  });

  it("stamps takenAt with today's LOCAL date", async () => {
    const { result } = renderHook(() => useFilingFolders("a@example.com"));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    let id = "";
    act(() => {
      id = result.current.addFolder({ name: "Taxes 2025" })!.id;
    });
    act(() => result.current.checkOut(id, { toPlaceId: null, heldBy: "Accountant" }));
    expect(result.current.folders.find((f) => f.id === id)!.takenAt).toBe("2026-09-30");
  });
});
