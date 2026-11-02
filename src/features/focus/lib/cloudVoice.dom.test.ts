import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TTS_CACHE,
  cloudVoiceKnown,
  fetchSpeech,
  prefetchSpeech,
  probeCloudVoice,
  resetCloudVoice,
} from "@/features/focus/lib/cloudVoice";

// A Cache Storage with the one property that matters here: it outlives the page's
// in-memory state, so a second "session" finds what the first one fetched.
function fakeCaches() {
  const store = new Map<string, Response>();
  const cache = {
    match: async (k: string) => store.get(k)?.clone(),
    put: async (k: string, r: Response) => void store.set(k, r),
    keys: async () => [...store.keys()].map((url) => ({ url })),
    delete: async (k: string | { url: string }) => store.delete(typeof k === "string" ? k : k.url),
  };
  return { store, storage: { open: async () => cache } };
}

// Node's own Blob: jsdom's has no stream(), which Response needs; a browser has both.
const audio = () => new NodeBlob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }) as unknown as Blob;
let fetchMock: ReturnType<typeof vi.fn>;
let disk: ReturnType<typeof fakeCaches>;

beforeEach(() => {
  resetCloudVoice();
  disk = fakeCaches();
  vi.stubGlobal("caches", disk.storage);
  fetchMock = vi.fn(async () => new Response(audio(), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("fetchSpeech", () => {
  it("asks the server for the line, voice and speed", async () => {
    await fetchSpeech("Breathe in", "sage", 0.9);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/tts");
    expect(JSON.parse(init.body)).toEqual({ text: "Breathe in", voice: "sage", speed: 0.9 });
  });

  it("never pays twice for a line: the second ask is answered from memory", async () => {
    await fetchSpeech("Breathe in", "sage", 0.9);
    await fetchSpeech("Breathe in", "sage", 0.9);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("…and after a reload, from the device's cache", async () => {
    await fetchSpeech("Breathe in", "sage", 0.9);
    await vi.waitFor(() => expect(disk.store.size).toBe(1)); // the write is not awaited by the caller
    resetCloudVoice(); // a new page: memory is gone, the cache is not
    await fetchSpeech("Breathe in", "sage", 0.9);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect([...disk.store.keys()][0]).toMatch(/^\/__tts\//);
  });

  it("treats a different voice, speed or wording as a different line", async () => {
    await fetchSpeech("Breathe in", "sage", 0.9);
    await fetchSpeech("Breathe in", "coral", 0.9);
    await fetchSpeech("Breathe in", "sage", 1);
    await fetchSpeech("Breathe out", "sage", 0.9);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("makes one request for the same line asked for at once", async () => {
    await Promise.all([
      fetchSpeech("Hold", "sage", 0.9),
      fetchSpeech("Hold", "sage", 0.9),
      fetchSpeech("Hold", "sage", 0.9),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects when the server can't make it, and does not remember the failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 502 }));
    await expect(fetchSpeech("Hold", "sage", 0.9)).rejects.toThrow();
    await expect(fetchSpeech("Hold", "sage", 0.9)).resolves.toMatchObject({ size: 3 }); // tried again
  });

  it("rejects an empty reply, and a network error", async () => {
    fetchMock.mockResolvedValueOnce(new Response(new NodeBlob([]) as unknown as Blob, { status: 200 }));
    await expect(fetchSpeech("a", "sage", 0.9)).rejects.toThrow();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(fetchSpeech("b", "sage", 0.9)).rejects.toThrow();
  });

  it("learns the deployment has no key from a 503, so it stops being asked", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    await expect(fetchSpeech("a", "sage", 0.9)).rejects.toThrow();
    expect(cloudVoiceKnown()).toBe(false);
  });

  it("keeps the device cache bounded, dropping the oldest", async () => {
    for (let i = 0; i < 303; i++) disk.store.set(`/__tts/old${i}`, new Response("x"));
    await fetchSpeech("fresh line", "sage", 0.9);
    await vi.waitFor(() => expect(disk.store.size).toBeLessThanOrEqual(300));
    expect(disk.store.has("/__tts/old0")).toBe(false);
    expect([...disk.store.keys()].some((k) => k.startsWith("/__tts/") && !k.includes("old"))).toBe(true);
  });

  it("works with no Cache Storage at all", async () => {
    vi.stubGlobal("caches", undefined);
    await expect(fetchSpeech("Hold", "sage", 0.9)).resolves.toMatchObject({ size: 3 });
  });

  it("names its cache as the service worker expects", () => {
    expect(TTS_CACHE).toBe("bmd-tts-v1");
  });
});

describe("prefetchSpeech", () => {
  it("fetches each distinct line once, a few at a time, and swallows failures", async () => {
    let active = 0;
    let peak = 0;
    fetchMock.mockImplementation(async (_u: string, init: { body: string }) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      if (JSON.parse(init.body).text === "bad") return new Response("{}", { status: 502 });
      return new Response(audio(), { status: 200 });
    });
    await prefetchSpeech(["a", "b", "a", "  ", "bad", "c", "d", "e"], "sage", 0.9, 3);
    const texts = fetchMock.mock.calls.map(([, i]) => JSON.parse(i.body).text).sort();
    expect(texts).toEqual(["a", "b", "bad", "c", "d", "e"]);
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe("probeCloudVoice", () => {
  it("asks once and remembers the answer", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ configured: true }), { status: 200 }));
    expect(cloudVoiceKnown()).toBeUndefined();
    expect(await probeCloudVoice()).toBe(true);
    expect(await probeCloudVoice()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cloudVoiceKnown()).toBe(true);
  });

  it("says no for an unconfigured deployment and for an error", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ configured: false }), { status: 200 }));
    expect(await probeCloudVoice()).toBe(false);
    resetCloudVoice();
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    expect(await probeCloudVoice()).toBe(false);
  });

  it("doesn't remember a failure to ask (offline), so it can ask again", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await probeCloudVoice()).toBe(false);
    expect(cloudVoiceKnown()).toBeUndefined();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ configured: true }), { status: 200 }));
    expect(await probeCloudVoice()).toBe(true);
  });
});
