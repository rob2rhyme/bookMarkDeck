import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("@/lib/fetchPageTitle", () => ({ fetchPageTitle: vi.fn() }));
import { getToken } from "next-auth/jwt";
import { fetchPageTitle } from "@/lib/fetchPageTitle";
import { GET } from "./route";

let n = 0; // a fresh account per test, so the rate limiter's memory can't leak between them
const get = (url?: string) =>
  new NextRequest(
    `https://app.example.com/api/link-title${url === undefined ? "" : `?url=${encodeURIComponent(url)}`}`
  );

beforeEach(() => {
  n++;
  vi.mocked(getToken).mockReset().mockResolvedValue({ sub: `user-${n}` } as never);
  vi.mocked(fetchPageTitle).mockReset().mockResolvedValue("Example Domain");
});

describe("GET /api/link-title", () => {
  it("answers the page's title, cacheable privately", async () => {
    const res = await GET(get("https://example.com/"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: "Example Domain" });
    expect(res.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(fetchPageTitle).toHaveBeenCalledWith("https://example.com/");
  });

  it("answers null, not an error, when the page gives no title", async () => {
    vi.mocked(fetchPageTitle).mockResolvedValue(null);
    const res = await GET(get("https://example.com/"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: null });
  });

  it("refuses a caller without a session, before fetching anything", async () => {
    vi.mocked(getToken).mockResolvedValue(null);
    const res = await GET(get("https://example.com/"));
    expect(res.status).toBe(401);
    expect(fetchPageTitle).not.toHaveBeenCalled();
  });

  it("refuses anything but an http(s) URL", async () => {
    for (const bad of [undefined, "", "javascript:alert(1)", "file:///etc/passwd", "example.com", `https://x.com/${"a".repeat(2100)}`]) {
      const res = await GET(get(bad));
      expect(res.status, String(bad).slice(0, 30)).toBe(400);
    }
    expect(fetchPageTitle).not.toHaveBeenCalled();
  });

  it("rate-limits one account to 30 a minute", async () => {
    for (let i = 0; i < 30; i++) expect((await GET(get(`https://e.com/${i}`))).status).toBe(200);
    expect((await GET(get("https://e.com/31"))).status).toBe(429);
    expect(fetchPageTitle).toHaveBeenCalledTimes(30);
  });
});
