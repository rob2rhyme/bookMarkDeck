import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("@/lib/siteIcon", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/siteIcon")>()),
  fetchSiteIcon: vi.fn(),
}));
import { getToken } from "next-auth/jwt";
import { fetchSiteIcon } from "@/lib/siteIcon";
import { GET } from "./route";

let n = 0;
const get = (host?: string) =>
  new NextRequest(`https://app.example.com/api/icon${host === undefined ? "" : `?host=${encodeURIComponent(host)}`}`);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

beforeEach(() => {
  n++;
  vi.mocked(getToken).mockReset().mockResolvedValue({ sub: `user-${n}` } as never);
  vi.mocked(fetchSiteIcon).mockReset().mockResolvedValue({ bytes: PNG, type: "image/png" });
});

describe("GET /api/icon", () => {
  it("serves the icon as an inert image the browser keeps a week", async () => {
    const res = await GET(get("example.com"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private, max-age=604800");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG);
    expect(fetchSiteIcon).toHaveBeenCalledWith("example.com");
  });

  it("answers 404 when the site has no icon, remembered for a day", async () => {
    vi.mocked(fetchSiteIcon).mockResolvedValue(null);
    const res = await GET(get("example.com"));
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("private, max-age=86400");
  });

  it("refuses a caller without a session, before fetching anything", async () => {
    vi.mocked(getToken).mockResolvedValue(null);
    expect((await GET(get("example.com"))).status).toBe(401);
    expect(fetchSiteIcon).not.toHaveBeenCalled();
  });

  it("refuses anything but a bare public hostname", async () => {
    for (const bad of [undefined, "127.0.0.1", "localhost", "example.com:22", "https://example.com"]) {
      expect((await GET(get(bad))).status).toBe(400);
    }
    expect(fetchSiteIcon).not.toHaveBeenCalled();
  });
});
