import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGoogleTodoSync } from "./useGoogleTodoSync";

// The server can't know the user's zone, so the client names the due DAY.
describe("useGoogleTodoSync — due date", () => {
  const saved = process.env.TZ;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    process.env.TZ = "America/Los_Angeles";
    fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.TZ = saved;
  });

  it("sends the LOCAL day a to-do is due", async () => {
    const { result } = renderHook(() => useGoogleTodoSync(true, () => {}));
    await result.current.mirror({
      id: "t1",
      text: "Call mum",
      dueAt: "2026-10-01T03:00:00.000Z", // 8pm, Sep 30
    } as Parameters<typeof result.current.mirror>[0]);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.dueDate).toBe("2026-09-30");
  });
});
