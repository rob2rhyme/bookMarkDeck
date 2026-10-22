import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// Write-back to Google Calendar: create and delete on the PRIMARY calendar only.
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
import { getToken } from "next-auth/jwt";
import { DELETE, POST } from "./route";

const EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
let fetchMock: ReturnType<typeof vi.fn>;

const post = (body: unknown) =>
  new Request("https://app.example.com/api/google/events", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
const del = (qs: string) =>
  new Request(`https://app.example.com/api/google/events${qs}`, { method: "DELETE" }) as unknown as NextRequest;
const sent = () => JSON.parse(String(fetchMock.mock.calls[0][1].body));

beforeEach(() => {
  vi.mocked(getToken).mockReset().mockResolvedValue({ accessToken: "t" } as never);
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "ev1" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/google/events", () => {
  it("creates a timed event on the primary calendar, ending after the duration", async () => {
    const res = await POST(post({ title: "Dentist", start: "2026-10-23T14:00:00.000Z", durationMin: 60 }));
    expect(await res.json()).toEqual({ id: "ev1" });
    expect(fetchMock.mock.calls[0][0]).toBe(EVENTS);
    expect(sent()).toMatchObject({
      summary: "Dentist",
      start: { dateTime: "2026-10-23T14:00:00.000Z" },
      end: { dateTime: "2026-10-23T15:00:00.000Z" },
    });
  });

  it("creates an all-day event whose end is the next day (Google's end is exclusive)", async () => {
    await POST(post({ title: "Holiday", start: "2026-12-31" }));
    expect(sent()).toMatchObject({ start: { date: "2026-12-31" }, end: { date: "2027-01-01" } });
  });

  it("defaults and clamps the duration", async () => {
    const start = "2026-10-23T14:00:00.000Z";
    await POST(post({ title: "a", start }));
    expect(sent().end.dateTime).toBe("2026-10-23T14:30:00.000Z");
    fetchMock.mockClear();
    await POST(post({ title: "b", start, durationMin: 99999 }));
    expect(sent().end.dateTime).toBe("2026-10-24T14:00:00.000Z"); // capped at a day
    fetchMock.mockClear();
    await POST(post({ title: "c", start, durationMin: 1 }));
    expect(sent().end.dateTime).toBe("2026-10-23T14:05:00.000Z"); // at least five minutes
  });

  it("trims the title and keeps notes as the description", async () => {
    await POST(post({ title: "  Standup  ", start: "2026-10-23", notes: " bring laptop " }));
    expect(sent()).toMatchObject({ summary: "Standup", description: "bring laptop" });
  });

  it.each([
    ["no title", { start: "2026-10-23" }, "missing_title"],
    ["a blank title", { title: "  ", start: "2026-10-23" }, "missing_title"],
    ["no start", { title: "x" }, "bad_start"],
    ["a start that isn't a date", { title: "x", start: "tomorrow-ish" }, "bad_start"],
  ])("400 for %s, calling nothing", async (_l, body, error) => {
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(error);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400 for a body that isn't JSON", async () => {
    expect((await POST(post("{nope"))).status).toBe(400);
  });

  it("401 without a Google token, calling nothing", async () => {
    vi.mocked(getToken).mockResolvedValue(null as never);
    expect((await POST(post({ title: "x", start: "2026-10-23" }))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("502 when Google refuses", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 403 }));
    expect((await POST(post({ title: "x", start: "2026-10-23" }))).status).toBe(502);
  });
});

describe("DELETE /api/google/events", () => {
  it("deletes the event from the primary calendar", async () => {
    const res = await DELETE(del("?id=ev1"));
    expect(await res.json()).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][0]).toBe(`${EVENTS}/ev1`);
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });

  it("counts an event that is already gone as deleted", async () => {
    for (const status of [404, 410]) {
      fetchMock.mockResolvedValue(new Response("", { status }));
      expect((await DELETE(del("?id=ev1"))).status).toBe(200);
    }
  });

  it.each(["", "?id=", "?id=../calendars/x", "?id=a/b", "?id=a%2Fb", "?id=" + "x".repeat(201)])(
    "refuses an id that could change the path (%s)",
    async (qs) => {
      expect((await DELETE(del(qs))).status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("401 without a token; 502 when Google errors", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    expect((await DELETE(del("?id=ev1"))).status).toBe(502);
    vi.mocked(getToken).mockResolvedValue(null as never);
    expect((await DELETE(del("?id=ev1"))).status).toBe(401);
  });
});
