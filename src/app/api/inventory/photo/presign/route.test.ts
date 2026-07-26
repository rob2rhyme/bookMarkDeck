import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
import { getToken } from "next-auth/jwt";
import { POST } from "./route";

const R2 = {
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "akid",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "bucket",
  R2_PUBLIC_BASE_URL: "https://cdn.example.com",
};

function req(body: unknown): NextRequest {
  return new Request("http://localhost/api/inventory/photo/presign", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function asUser(sub: string) {
  vi.mocked(getToken).mockResolvedValue({ sub } as never);
}

beforeEach(() => {
  vi.mocked(getToken).mockReset();
  vi.stubEnv("NEXTAUTH_SECRET", "test");
  for (const k of Object.keys(R2)) vi.stubEnv(k, ""); // unconfigured by default
});

afterEach(() => vi.unstubAllEnvs());

describe("presign route", () => {
  it("401 when logged out", async () => {
    vi.mocked(getToken).mockResolvedValue(null as never);
    const res = await POST(req({ contentType: "image/webp" }));
    expect(res.status).toBe(401);
  });

  it("enabled:false when R2 is unconfigured", async () => {
    asUser("userA");
    const res = await POST(req({ contentType: "image/webp" }));
    expect(await res.json()).toEqual({ enabled: false });
  });

  describe("with R2 configured", () => {
    beforeEach(() => {
      for (const [k, v] of Object.entries(R2)) vi.stubEnv(k, v);
    });

    it("derives a per-user path that differs across users (IDOR guard)", async () => {
      asUser("userA");
      const a = await (
        await POST(req({ contentType: "image/webp", itemId: "x" }))
      ).json();
      asUser("userB");
      const b = await (
        await POST(req({ contentType: "image/webp", itemId: "x" }))
      ).json();

      expect(a.path).toMatch(/^inventory\/[a-f0-9]{16}\/x\//);
      expect(b.path).toMatch(/^inventory\/[a-f0-9]{16}\/x\//);
      expect(a.path.split("/")[1]).not.toBe(b.path.split("/")[1]);
    });

    it("400 unsupported_type for a non-image contentType", async () => {
      asUser("userC");
      const res = await POST(req({ contentType: "text/html" }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("unsupported_type");
    });

    it("sanitizes a path-traversal itemId", async () => {
      asUser("userD");
      const json = await (
        await POST(req({ contentType: "image/webp", itemId: "../../etc" }))
      ).json();
      expect(json.path).not.toContain("..");
      expect(json.path.split("/")[2]).toBe("etc");
    });

    it("429 after exceeding the per-user rate limit", async () => {
      asUser("userE");
      let last: Response | undefined;
      for (let i = 0; i < 21; i++) {
        last = await POST(req({ contentType: "image/webp" }));
      }
      expect(last?.status).toBe(429);
    });
  });
});
