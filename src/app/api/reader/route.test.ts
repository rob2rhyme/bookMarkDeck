import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("@/lib/fetchPage", () => ({ fetchHtml: vi.fn() }));
import { getToken } from "next-auth/jwt";
import { fetchHtml } from "@/lib/fetchPage";
import { GET } from "./route";

let n = 0; // a fresh account per test, so the rate limiter's memory can't leak between them
const get = (url?: string) =>
  new NextRequest(`https://app.example.com/api/reader${url === undefined ? "" : `?url=${encodeURIComponent(url)}`}`);
const LONG = "Readable words about something worth reading calmly. ".repeat(8);
const html = (body: string) => `<html><head><title>T</title></head><body><article>${body}</article></body></html>`;

beforeEach(() => {
  n++;
  vi.mocked(getToken).mockReset().mockResolvedValue({ sub: `user-${n}` } as never);
  vi.mocked(fetchHtml).mockReset().mockResolvedValue({ html: html(`<p>${LONG}</p>`), truncated: false });
});

describe("GET /api/reader", () => {
  it("answers the page's readable blocks, cacheable privately for a short while", async () => {
    const res = await GET(get("https://example.com/post"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.article.title).toBe("T");
    expect(body.article.blocks[0]).toMatchObject({ type: "p" });
    expect(body.article.truncated).toBe(false);
    expect(res.headers.get("cache-control")).toBe("private, max-age=600");
    expect(fetchHtml).toHaveBeenCalledWith("https://example.com/post", { maxBytes: 1_500_000, timeoutMs: 8000 });
  });

  it("carries the fetcher's 'cut at the size limit' into truncated", async () => {
    vi.mocked(fetchHtml).mockResolvedValue({ html: html(`<p>${LONG}</p>`), truncated: true });
    expect((await (await GET(get("https://example.com/"))).json()).article.truncated).toBe(true);
  });

  it("answers null — not an error — for an unfetchable or empty page", async () => {
    vi.mocked(fetchHtml).mockResolvedValue(null);
    let res = await GET(get("https://example.com/"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ article: null });
    vi.mocked(fetchHtml).mockResolvedValue({ html: html("<p>Tiny.</p>"), truncated: false });
    res = await GET(get("https://example.com/"));
    expect(await res.json()).toEqual({ article: null });
  });

  it("refuses a caller without a session, before fetching anything", async () => {
    vi.mocked(getToken).mockResolvedValue(null);
    expect((await GET(get("https://example.com/"))).status).toBe(401);
    expect(fetchHtml).not.toHaveBeenCalled();
  });

  it("refuses anything but an http(s) URL", async () => {
    for (const bad of [undefined, "", "javascript:alert(1)", "file:///etc/passwd", "example.com", `https://x.com/${"a".repeat(2100)}`]) {
      expect((await GET(get(bad))).status, String(bad).slice(0, 30)).toBe(400);
    }
    expect(fetchHtml).not.toHaveBeenCalled();
  });

  it("rate-limits one account to 20 a minute", async () => {
    for (let i = 0; i < 20; i++) expect((await GET(get(`https://e.com/${i}`))).status).toBe(200);
    expect((await GET(get("https://e.com/21"))).status).toBe(429);
    expect(fetchHtml).toHaveBeenCalledTimes(20);
  });
});
