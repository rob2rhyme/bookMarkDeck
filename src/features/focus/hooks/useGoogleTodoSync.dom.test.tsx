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

// What Google now holds is recorded only for a write that landed, so the pull can
// tell "Google changed it" from "our push never arrived".
describe("useGoogleTodoSync — what Google holds", () => {
  const todo = {
    id: "t1",
    text: "Call mum",
    done: true,
    dueAt: "2026-10-23T14:00:00.000Z",
    gsync: { dueAt: "2026-10-22T09:00:00.000Z", done: false },
  } as Parameters<ReturnType<typeof useGoogleTodoSync>["mirror"]>[0];

  const run = async (reply: object) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(reply), { status: 200 })));
    const setIds = vi.fn();
    const { result } = renderHook(() => useGoogleTodoSync(true, setIds));
    await result.current.mirror(todo);
    vi.unstubAllGlobals();
    return setIds.mock.calls[0][1];
  };

  it("records the new state when both writes landed", async () => {
    const ids = await run({ googleTaskId: "g", googleEventId: "e", synced: { task: true, event: true } });
    expect(ids.gsync).toEqual({ dueAt: "2026-10-23T14:00:00.000Z", done: true });
  });

  it("keeps the old half when that write failed", async () => {
    const ids = await run({ googleTaskId: "g", googleEventId: "e", synced: { task: false, event: true } });
    expect(ids.gsync).toEqual({ dueAt: "2026-10-23T14:00:00.000Z", done: false });
    const ids2 = await run({ googleTaskId: "g", googleEventId: "e", synced: { task: true, event: false } });
    expect(ids2.gsync).toEqual({ dueAt: "2026-10-22T09:00:00.000Z", done: true });
  });

  it("treats a server that doesn't say as having landed (an older deployment)", async () => {
    const ids = await run({ googleTaskId: "g", googleEventId: "e" });
    expect(ids.gsync).toEqual({ dueAt: "2026-10-23T14:00:00.000Z", done: true });
  });
});
