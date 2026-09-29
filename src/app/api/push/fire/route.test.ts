import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The only route in the app with NO session gate — it is reachable by anyone and
// gated solely by the QStash signature. So the load-bearing assertion here is
// that an invalid signature sends nothing.
vi.mock("@upstash/qstash", () => ({ Receiver: vi.fn() }));
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}));

import { Receiver } from "@upstash/qstash";
import webpush from "web-push";
import { POST } from "./route";

const ENV = {
  VAPID_PRIVATE_KEY: "vapid-priv",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "vapid-pub",
  QSTASH_CURRENT_SIGNING_KEY: "sig-cur",
  QSTASH_NEXT_SIGNING_KEY: "sig-next",
};

const BODY = {
  subscription: { endpoint: "https://push.example.com/abc" },
  title: "Time's up",
  body: "Block finished",
  url: "/focus",
};

let verify: ReturnType<typeof vi.fn>;

function req(body: unknown, signature = "sig"): Request {
  return new Request("https://app.example.com/api/push/fire", {
    method: "POST",
    headers: { "upstash-signature": signature },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  verify = vi.fn().mockResolvedValue(true);
  // Regular function, not an arrow: the route calls `new Receiver(...)`, and an
  // arrow has no [[Construct]].
  vi.mocked(Receiver).mockImplementation(function () {
    return { verify } as unknown as InstanceType<typeof Receiver>;
  } as never);
  vi.mocked(webpush.setVapidDetails).mockReset();
  vi.mocked(webpush.sendNotification).mockReset().mockResolvedValue({} as never);
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
});

afterEach(() => vi.unstubAllEnvs());

describe("push fire route", () => {
  it.each(Object.keys(ENV))("503 when %s is missing", async (missing) => {
    vi.stubEnv(missing, "");
    const res = await POST(req(BODY));
    expect(res.status).toBe(503);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("401 on an invalid signature, and sends nothing", async () => {
    verify.mockResolvedValue(false);
    const res = await POST(req(BODY, "forged"));
    expect(res.status).toBe(401);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("401 when verification throws, and sends nothing", async () => {
    verify.mockRejectedValue(new Error("bad key"));
    const res = await POST(req(BODY));
    expect(res.status).toBe(401);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("verifies the raw body against the upstash-signature header", async () => {
    const raw = JSON.stringify(BODY);
    await POST(req(BODY, "sig-abc"));
    expect(verify).toHaveBeenCalledWith({ signature: "sig-abc", body: raw });
  });

  it("400 on a verified but unparseable body", async () => {
    const res = await POST(req("{not json"));
    expect(res.status).toBe(400);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("400 when the payload carries no subscription", async () => {
    const res = await POST(req({ title: "hi" }));
    expect(res.status).toBe(400);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it("sends the notification on the happy path", async () => {
    const res = await POST(req(BODY));
    expect(await res.json()).toEqual({ ok: true });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);

    const [sub, payload] = vi.mocked(webpush.sendNotification).mock.calls[0];
    expect(sub).toEqual(BODY.subscription);
    expect(JSON.parse(String(payload))).toEqual({
      title: "Time's up",
      body: "Block finished",
      url: "/focus",
    });
  });

  // sw.js shows the tag, and a notification replaces any other with the same
  // one — so dropping it here collapsed every pillar onto the timer's.
  it("forwards the tag to the service worker", async () => {
    await POST(req({ ...BODY, tag: "filing-digest" }));
    const [, payload] = vi.mocked(webpush.sendNotification).mock.calls[0];
    expect(JSON.parse(String(payload)).tag).toBe("filing-digest");
  });

  it("defaults title, body and url when the payload omits them", async () => {
    await POST(req({ subscription: BODY.subscription }));
    const [, payload] = vi.mocked(webpush.sendNotification).mock.calls[0];
    expect(JSON.parse(String(payload))).toEqual({
      title: "Bookmark Deck",
      body: "",
      url: "/focus",
    });
  });

  // An expired or revoked subscription must not surface as a 5xx: QStash retries
  // on failure, and a dead endpoint would retry-storm.
  it("reports a failed send as 200 ok:false rather than an error", async () => {
    vi.mocked(webpush.sendNotification).mockRejectedValue(new Error("410 gone"));
    const res = await POST(req(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, delivered: false });
  });
});
