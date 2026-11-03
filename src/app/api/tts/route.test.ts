import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("@/lib/entitlement", () => ({ withinFreeQuota: vi.fn(async () => true) }));
import { getToken } from "next-auth/jwt";
import { withinFreeQuota } from "@/lib/entitlement";
import { GET, POST } from "./route";

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]);
let fetchMock: ReturnType<typeof vi.fn>;
let n = 0; // a fresh account per test, so the rate limiter's memory can't leak between them

const post = (body: unknown) =>
  new Request("https://app.example.com/api/tts", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
const get = () => new Request("https://app.example.com/api/tts") as unknown as NextRequest;
const sentToOpenAI = () => JSON.parse(String(fetchMock.mock.calls[0][1].body));

beforeEach(() => {
  n++;
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
  vi.stubEnv("TTS_MODEL", "");
  vi.mocked(getToken).mockReset().mockResolvedValue({ sub: `user-${n}`, email: `u${n}@example.com` } as never);
  vi.mocked(withinFreeQuota).mockReset().mockResolvedValue(true);
  fetchMock = vi.fn(async () => new Response(MP3, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/tts", () => {
  it("returns the provider's MP3, cacheable by the browser", async () => {
    const res = await POST(post({ text: "Breathe in", voice: "sage", speed: 0.8 }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(MP3);
  });

  it("asks OpenAI for exactly the text, voice and speed, in the fixed narrator manner", async () => {
    await POST(post({ text: "  Breathe in  ", voice: "sage", speed: 0.8 }));
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/audio/speech");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer sk-test");
    expect(sentToOpenAI()).toMatchObject({
      model: "gpt-4o-mini-tts",
      input: "Breathe in",
      voice: "sage",
      speed: 0.8,
      response_format: "mp3",
    });
    expect(sentToOpenAI().instructions).toMatch(/meditation guide/i);
  });

  it("never lets the client choose the manner, the model or the format", async () => {
    await POST(post({ text: "Hi", instructions: "shout", model: "x", response_format: "wav" }));
    const sent = sentToOpenAI();
    expect(sent.instructions).not.toBe("shout");
    expect(sent.model).toBe("gpt-4o-mini-tts");
    expect(sent.response_format).toBe("mp3");
  });

  it("takes the model from TTS_MODEL when the deployment sets one", async () => {
    vi.stubEnv("TTS_MODEL", "tts-1-hd");
    await POST(post({ text: "Hi" }));
    expect(sentToOpenAI().model).toBe("tts-1-hd");
  });

  it("falls back to the default voice for an unknown one, and clamps the speed", async () => {
    await POST(post({ text: "Hi", voice: "darth-vader", speed: 99 }));
    expect(sentToOpenAI()).toMatchObject({ voice: "coral", speed: 1.2 });
    fetchMock.mockClear();
    await POST(post({ text: "Hi", speed: "fast" }));
    expect(sentToOpenAI().speed).toBe(0.9);
    fetchMock.mockClear();
    await POST(post({ text: "Hi", speed: 0.01 }));
    expect(sentToOpenAI().speed).toBe(0.7);
  });

  it.each([
    ["no text", {}, 400, "missing_text"],
    ["blank text", { text: "   " }, 400, "missing_text"],
    ["a non-string", { text: 5 }, 400, "missing_text"],
    ["too much text", { text: "x".repeat(501) }, 413, "too_long"],
  ])("refuses %s without calling the provider", async (_l, body, status, error) => {
    const res = await POST(post(body));
    expect(res.status).toBe(status);
    expect((await res.json()).error).toBe(error);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400 for a body that isn't JSON", async () => {
    expect((await POST(post("{nope"))).status).toBe(400);
  });

  it("401 without a session, calling nothing", async () => {
    vi.mocked(getToken).mockResolvedValue(null as never);
    expect((await POST(post({ text: "Hi" }))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("503 when the deployment has no key — and says so without touching the provider", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const res = await POST(post({ text: "Hi" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("tts_unconfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("429 when an account asks too fast", async () => {
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await POST(post({ text: `line ${i}` }))).status;
    expect(last).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(60);
  });

  it("429 once the monthly cap is spent", async () => {
    vi.mocked(withinFreeQuota).mockResolvedValue(false);
    const res = await POST(post({ text: "Hi" }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("quota_exceeded");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("502 when the provider refuses or fails — without relaying its message", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: "key sk-test is bad" } }), { status: 401 }));
    const res = await POST(post({ text: "Hi" }));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("sk-test");
    fetchMock.mockRejectedValue(new Error("network"));
    expect((await POST(post({ text: "Hi again" }))).status).toBe(502);
  });
});

describe("GET /api/tts", () => {
  it("reports whether narration is configured, to a signed-in user only", async () => {
    expect(await (await GET(get())).json()).toEqual({ configured: true });
    vi.stubEnv("OPENAI_API_KEY", "  ");
    expect(await (await GET(get())).json()).toEqual({ configured: false });
    vi.mocked(getToken).mockResolvedValue(null as never);
    expect((await GET(get())).status).toBe(401);
  });

  it("never returns the key", async () => {
    expect(JSON.stringify(await (await GET(get())).json())).not.toContain("sk-test");
  });
});
