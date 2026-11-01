import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
import { getToken } from "next-auth/jwt";
import { POST } from "./route";

const TASKS = "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks";
const EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
let answers: Record<string, Response>;
let fetchMock: ReturnType<typeof vi.fn>;

const req = (body: unknown) =>
  new Request("https://app.example.com/api/google/todos/status", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  answers = {};
  vi.mocked(getToken).mockReset().mockResolvedValue({ accessToken: "t" } as never);
  fetchMock = vi.fn(async (url: string) => answers[url] ?? json({}, 404));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/google/todos/status", () => {
  it("reports a completed Task and the event's current start", async () => {
    answers[`${TASKS}/gt`] = json({ status: "completed" });
    answers[`${EVENTS}/ge`] = json({ start: { dateTime: "2026-10-24T09:30:00Z" } });
    const res = await POST(req({ items: [{ id: "t1", googleTaskId: "gt", googleEventId: "ge" }] }));
    expect((await res.json()).results).toEqual([
      {
        id: "t1",
        task: { state: "ok", completed: true },
        event: { state: "ok", start: "2026-10-24T09:30:00Z" },
      },
    ]);
  });

  it("reports needs-action and an all-day event (no time)", async () => {
    answers[`${TASKS}/gt`] = json({ status: "needsAction" });
    answers[`${EVENTS}/ge`] = json({ start: { date: "2026-10-24" } });
    const [r] = (await (await POST(req({ items: [{ id: "t1", googleTaskId: "gt", googleEventId: "ge" }] }))).json()).results;
    expect(r.task).toEqual({ state: "ok", completed: false });
    expect(r.event).toEqual({ state: "ok", start: null });
  });

  it("treats 404/410, a deleted Task and a cancelled event as gone", async () => {
    answers[`${TASKS}/gone1`] = json({}, 404);
    answers[`${TASKS}/gone2`] = json({ deleted: true });
    answers[`${EVENTS}/gone3`] = json({ status: "cancelled" });
    answers[`${EVENTS}/gone4`] = json({}, 410);
    const res = await POST(
      req({
        items: [
          { id: "a", googleTaskId: "gone1" },
          { id: "b", googleTaskId: "gone2" },
          { id: "c", googleEventId: "gone3" },
          { id: "d", googleEventId: "gone4" },
        ],
      })
    );
    const out = (await res.json()).results;
    expect(out[0].task.state).toBe("gone");
    expect(out[1].task.state).toBe("gone");
    expect(out[2].event.state).toBe("gone");
    expect(out[3].event.state).toBe("gone");
  });

  it("calls an unexpected Google error an error, not gone — so nothing is unlinked on a blip", async () => {
    answers[`${TASKS}/gt`] = json({}, 500);
    const [r] = (await (await POST(req({ items: [{ id: "t", googleTaskId: "gt" }] }))).json()).results;
    expect(r.task.state).toBe("error");
  });

  it("looks up only what a to-do has", async () => {
    answers[`${TASKS}/gt`] = json({ status: "needsAction" });
    const [r] = (await (await POST(req({ items: [{ id: "t", googleTaskId: "gt" }] }))).json()).results;
    expect(r.event).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("only ever reads from Google", async () => {
    await POST(req({ items: [{ id: "t", googleTaskId: "gt", googleEventId: "ge" }] }));
    for (const [, init] of fetchMock.mock.calls) {
      expect((init?.method ?? "GET").toUpperCase()).toBe("GET");
    }
  });

  it("refuses ids that could change the URL, and caps how many to-dos it looks at", async () => {
    await POST(req({ items: [{ id: "t", googleTaskId: "../x", googleEventId: "a/b" }] }));
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockClear();
    const many = Array.from({ length: 100 }, (_, i) => ({ id: `t${i}`, googleTaskId: `g${i}` }));
    await POST(req({ items: many }));
    expect(fetchMock).toHaveBeenCalledTimes(40);
  });

  it("401 without a token, 400 for a bad body", async () => {
    vi.mocked(getToken).mockResolvedValue(null as never);
    expect((await POST(req({ items: [] }))).status).toBe(401);
    vi.mocked(getToken).mockResolvedValue({ accessToken: "t" } as never);
    const bad = new Request("https://app.example.com/x", { method: "POST", body: "{nope" }) as unknown as NextRequest;
    expect((await POST(bad)).status).toBe(400);
  });
});
