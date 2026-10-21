import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// This route (and cancel) gate on getServerSession rather than getToken, so the
// mock target differs from the other route tests. @/auth/auth.config imports for
// real — it has a module-level side effect (it reassigns NEXTAUTH_URL) but does
// not throw on missing env, and its value is irrelevant once the session is
// stubbed.
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@upstash/qstash", () => ({ Client: vi.fn() }));

import { getServerSession } from "next-auth";
import { Client } from "@upstash/qstash";
import { POST } from "./route";

const MAX_DELAY_SEC = 24 * 60 * 60;

// QStash cannot reach localhost, and the route skips silently for such an
// origin — so anything exercising the publish path needs a real-looking host.
const LIVE = "https://app.example.com/api/push/schedule";
const SUB = { endpoint: "https://fcm.googleapis.com/fcm/send/abc" };

let publishJSON: ReturnType<typeof vi.fn>;

function req(body: unknown, url = LIVE): Request {
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

/** The single argument the route handed to QStash. */
function published() {
  expect(publishJSON).toHaveBeenCalledTimes(1);
  return publishJSON.mock.calls[0][0] as {
    url: string;
    delay: number;
    body: { title: string; body: string; url: string; tag: string; subscription: unknown };
  };
}

beforeEach(() => {
  vi.mocked(getServerSession).mockReset();
  vi.mocked(getServerSession).mockResolvedValue({ user: {} } as never);
  publishJSON = vi.fn().mockResolvedValue({ messageId: "msg_1" });
  // A regular function, not an arrow: the route calls `new Client(...)`, and an
  // arrow has no [[Construct]] so it throws TypeError inside the route's try —
  // which surfaces as a 502 and looks like a QStash failure rather than a broken
  // mock.
  vi.mocked(Client).mockImplementation(function () {
    return { publishJSON } as unknown as InstanceType<typeof Client>;
  } as never);
  vi.stubEnv("QSTASH_TOKEN", "qs-token");
});

afterEach(() => vi.unstubAllEnvs());

describe("push schedule route", () => {
  it("401 when logged out", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never);
    const res = await POST(req({ subscription: SUB }));
    expect(res.status).toBe(401);
    expect(publishJSON).not.toHaveBeenCalled();
  });

  it("503 when QSTASH_TOKEN is unset", async () => {
    vi.stubEnv("QSTASH_TOKEN", "");
    const res = await POST(req({ subscription: SUB }));
    expect(res.status).toBe(503);
    expect(publishJSON).not.toHaveBeenCalled();
  });

  it("400 on an unparseable body", async () => {
    const res = await POST(
      new Request(LIVE, { method: "POST", body: "{not json" })
    );
    expect(res.status).toBe(400);
  });

  describe("subscription validation", () => {
    it.each([
      ["missing", undefined],
      ["a string", "https://push.example.com/abc"],
      ["an object with no endpoint", {}],
      ["a non-https endpoint", { endpoint: "http://fcm.googleapis.com/abc" }],
      // fire POSTs to the endpoint, so anything but a push service is a request
      // this server would make to an address the caller chose.
      ["a host that isn't a push service", { endpoint: "https://evil.example/abc" }],
      ["a lookalike host", { endpoint: "https://fcm.googleapis.com.evil.example/abc" }],
      ["an internal address", { endpoint: "https://169.254.169.254/latest" }],
      ["credentials in the URL", { endpoint: "https://u:p@fcm.googleapis.com/abc" }],
      ["a non-default port", { endpoint: "https://fcm.googleapis.com:8443/abc" }],
    ])("400 for %s", async (_label, subscription) => {
      const res = await POST(req({ subscription }));
      expect(res.status).toBe(400);
      expect(publishJSON).not.toHaveBeenCalled();
    });
  });

  // CLAUDE.md: "/api/push/schedule clamps QStash delays to 24h, so a renewal
  // months out can't be queued when it's created."
  it("clamps a far-future delay to 24h", async () => {
    await POST(req({ subscription: SUB, delaySec: 999_999_999 }));
    expect(published().delay).toBe(MAX_DELAY_SEC);
  });

  it.each([
    ["a negative delay", -500, 0],
    ["a non-numeric delay", "soon", 0],
    ["NaN", Number.NaN, 0],
    ["a fractional delay", 10.6, 11],
    ["a delay inside the window", 300, 300],
  ])("normalises %s", async (_label, delaySec, expected) => {
    await POST(req({ subscription: SUB, delaySec }));
    expect(published().delay).toBe(expected);
  });

  // safeRelativeUrl is an open-redirect guard: "//evil.example" is a
  // protocol-relative URL that navigates off-site when the notification is
  // clicked. Only same-site relative paths survive.
  it.each([
    ["a protocol-relative URL", "//evil.example/x", "/focus"],
    ["a backslash URL the browser reads as protocol-relative", "/\\evil.example/x", "/focus"],
    ["a backslash later in the path", "/x\\..\\y", "/focus"],
    ["an absolute URL", "https://evil.example/x", "/focus"],
    ["a non-string", 42, "/focus"],
    ["a missing url", undefined, "/focus"],
    ["a relative path", "/filing", "/filing"],
  ])("rewrites %s", async (_label, url, expected) => {
    await POST(req({ subscription: SUB, url }));
    expect(published().body.url).toBe(expected);
  });

  it("forwards snooze only when it is exactly true", async () => {
    await POST(req({ subscription: SUB, snooze: true }));
    expect((published().body as { snooze?: boolean }).snooze).toBe(true);
    for (const snooze of [false, "true", 1, undefined]) {
      publishJSON.mockClear();
      await POST(req({ subscription: SUB, snooze }));
      expect(published().body).not.toHaveProperty("snooze");
    }
  });

  // The tag decides which notifications replace which, so each pillar's survives
  // to the worker; anything that isn't a short plain identifier falls back to
  // the tag every push used to share.
  it.each([
    ["a pillar tag", "filing-digest", "filing-digest"],
    ["a habit tag", "habit:3f2b-9c", "habit:3f2b-9c"],
    ["a missing tag", undefined, "bmd-focus-timer"],
    ["a non-string", 42, "bmd-focus-timer"],
    ["markup", "<img src=x>", "bmd-focus-timer"],
    ["an oversized tag", "t".repeat(65), "bmd-focus-timer"],
  ])("passes %s through as the notification tag", async (_label, tag, expected) => {
    await POST(req({ subscription: SUB, tag }));
    expect(published().body.tag).toBe(expected);
  });

  it("caps title at 120 and body at 300 characters", async () => {
    await POST(
      req({ subscription: SUB, title: "t".repeat(500), body: "b".repeat(500) })
    );
    const sent = published().body;
    expect(sent.title).toHaveLength(120);
    expect(sent.body).toHaveLength(300);
  });

  it("falls back to a default title, and an empty body, for non-strings", async () => {
    await POST(req({ subscription: SUB, title: 7, body: { oops: true } }));
    const sent = published().body;
    expect(sent.title).toBe("Time's up");
    expect(sent.body).toBe("");
  });

  it("skips silently on a localhost origin without calling QStash", async () => {
    const res = await POST(
      req({ subscription: SUB }, "http://localhost:3000/api/push/schedule")
    );
    expect(await res.json()).toEqual({ messageId: null, skipped: "local" });
    expect(publishJSON).not.toHaveBeenCalled();
  });

  it("posts back to its own origin's fire route", async () => {
    await POST(req({ subscription: SUB }));
    expect(published().url).toBe("https://app.example.com/api/push/fire");
  });

  it("502 when QStash rejects the publish", async () => {
    publishJSON.mockRejectedValue(new Error("upstream"));
    const res = await POST(req({ subscription: SUB }));
    expect(res.status).toBe(502);
  });

  it.each([
    ["Chrome", "https://fcm.googleapis.com/fcm/send/abc"],
    ["Firefox", "https://updates.push.services.mozilla.com/wpush/v2/abc"],
    ["Safari", "https://web.push.apple.com/abc"],
    ["Edge on Windows", "https://wns2-par02p.notify.windows.com/w/?token=abc"],
  ])("accepts %s's push service", async (_label, endpoint) => {
    await POST(req({ subscription: { endpoint } }));
    expect(published().body.subscription).toEqual({ endpoint });
  });

  it("rate-limits one account that schedules in a loop", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: "loop@example.com" } } as never);
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) statuses.push((await POST(req({ subscription: SUB }))).status);
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuses[60]).toBe(429);
  });
});
