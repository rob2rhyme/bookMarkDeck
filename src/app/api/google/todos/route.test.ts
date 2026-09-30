import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// Google Tasks keeps only the DATE part of `due`, and this route runs in UTC on
// the server, which can't know the user's zone. Sending the due instant made
// "this evening" in Los Angeles a Task due tomorrow, and "9am tomorrow" in
// Sydney a Task due today — while the Calendar event, a real instant, landed
// right. The client now sends its local day as `dueDate`.
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
import { getToken } from "next-auth/jwt";
import { POST } from "./route";

const TASKS = "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks";
let fetchMock: ReturnType<typeof vi.fn>;

function req(body: unknown): NextRequest {
  return new Request("https://app.example.com/api/google/todos", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

/** The body the route sent to Google Tasks. */
function taskBody() {
  const call = fetchMock.mock.calls.find(([url]) => String(url).startsWith(TASKS));
  return JSON.parse(String(call![1].body)) as { due?: string };
}

beforeEach(() => {
  vi.mocked(getToken).mockReset().mockResolvedValue({ accessToken: "t" } as never);
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "g1" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const EVENING_LA = "2026-10-01T03:00:00.000Z"; // 8pm, Sep 30, Los Angeles

describe("google todos route — task due date", () => {
  it("dates the Task on the day the client says it is", async () => {
    await POST(req({ todo: { text: "Call mum", dueAt: EVENING_LA }, dueDate: "2026-09-30" }));
    expect(taskBody().due).toBe("2026-09-30T00:00:00.000Z");
  });

  it.each([
    ["missing", undefined],
    ["not a date", "tomorrow"],
    ["a full instant", EVENING_LA],
  ])("falls back to the instant when dueDate is %s (an older client)", async (_l, dueDate) => {
    await POST(req({ todo: { text: "Call mum", dueAt: EVENING_LA }, dueDate }));
    expect(taskBody().due).toBe(EVENING_LA);
  });

  it("sends no due date for an undated to-do", async () => {
    await POST(req({ todo: { text: "Someday" }, dueDate: "2026-09-30" }));
    expect(taskBody().due).toBeUndefined();
  });

  it("401 without a Google token, and calls nothing", async () => {
    vi.mocked(getToken).mockResolvedValue(null as never);
    const res = await POST(req({ todo: { text: "x" } }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
