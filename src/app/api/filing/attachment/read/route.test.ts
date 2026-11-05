import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
import { getToken } from "next-auth/jwt";
import { POST } from "./route";

// The SigV4 maths has its own test (features/filing/lib/r2.test.ts), so the signer is
// not mocked and nothing here asserts on a signature. This is the part that decides WHO
// gets a read URL for WHAT: the session gate, ownership of the exact key, and the limit.

const R2 = {
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "akid",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "bucket",
};

const seg = (sub: string) => createHash("sha256").update(sub).digest("hex").slice(0, 16);
const own = (sub: string, file = "d1/abc.bin") => `filing/${seg(sub)}/${file}`;

const req = (body: unknown): NextRequest =>
  new Request("http://localhost/api/filing/attachment/read", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;

const asUser = (sub: string) => vi.mocked(getToken).mockResolvedValue({ sub } as never);

beforeEach(() => {
  vi.mocked(getToken).mockReset();
  vi.stubEnv("NEXTAUTH_SECRET", "test");
  for (const k of Object.keys(R2)) vi.stubEnv(k, "");
  vi.stubEnv("R2_FILING_BUCKET", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("filing attachment read route", () => {
  it("401 when logged out", async () => {
    vi.mocked(getToken).mockResolvedValue(null as never);
    expect((await POST(req({ path: own("readA") }))).status).toBe(401);
  });

  it("enabled:false when R2 is unconfigured", async () => {
    asUser("readB");
    expect(await (await POST(req({ path: own("readB") }))).json()).toEqual({ enabled: false });
  });

  describe("with R2 configured", () => {
    beforeEach(() => {
      for (const [k, v] of Object.entries(R2)) vi.stubEnv(k, v);
    });

    it("hands the owner a short-lived GET URL for their own object", async () => {
      asUser("readC");
      const res = await POST(req({ path: own("readC") }));
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      const { url } = await res.json();
      const u = new URL(url);
      expect(u.hostname).toBe("acct.r2.cloudflarestorage.com");
      expect(u.pathname).toBe(`/bucket/${own("readC")}`);
      expect(u.searchParams.get("X-Amz-Expires")).toBe("120");
      expect(u.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    });

    it("refuses another user's object — the IDOR guard — exactly like a bad path", async () => {
      asUser("readD");
      const res = await POST(req({ path: own("someone-else") }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("bad_path");
    });

    it.each([
      ["a traversal", (s: string) => `filing/${s}/../x.bin`],
      ["a doubled slash", (s: string) => `filing/${s}//x.bin`],
      ["another pillar's prefix", (s: string) => `inventory/${s}/x.webp`],
      ["no prefix at all", () => "x.bin"],
      ["a full URL", (s: string) => `https://evil.example/filing/${s}/x.bin`],
      ["odd characters", (s: string) => `filing/${s}/x y.bin`],
    ])("refuses %s", async (_name, make) => {
      asUser("readE");
      const res = await POST(req({ path: make(seg("readE")) }));
      expect(res.status).toBe(400);
    });

    it("refuses a missing, empty or non-string path, and a body that is not JSON", async () => {
      asUser("readF");
      for (const body of [{}, { path: "" }, { path: 7 }, { path: null }, "not json"]) {
        expect((await POST(req(body))).status).toBe(400);
      }
    });

    it("reads from R2_FILING_BUCKET when that is set", async () => {
      vi.stubEnv("R2_FILING_BUCKET", "filing-private");
      asUser("readG");
      const { url } = await (await POST(req({ path: own("readG") }))).json();
      expect(new URL(url).pathname).toBe(`/filing-private/${own("readG")}`);
    });

    it("429 after the per-user limit, and the limit is per user", async () => {
      asUser("readH");
      let last: Response | undefined;
      for (let i = 0; i < 121; i++) last = await POST(req({ path: own("readH") }));
      expect(last?.status).toBe(429);
      asUser("readI");
      expect((await POST(req({ path: own("readI") }))).status).toBe(200);
    });
  });
});
