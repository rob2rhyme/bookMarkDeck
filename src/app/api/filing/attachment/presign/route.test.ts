import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
import { getToken } from "next-auth/jwt";
import { POST } from "./route";

// The R2 signer is NOT mocked — SigV4 correctness has its own unit test in
// features/filing/lib/r2.test.ts. This file covers what that one cannot reach:
// the session gate, the accepted-type map, the declared-size cap and the
// throttle. Nothing here asserts on `uploadUrl`.

const R2 = {
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "akid",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "bucket",
  R2_PUBLIC_BASE_URL: "https://cdn.example.com",
};

const MAX_BYTES = 20 * 1024 * 1024;

function req(body: unknown): NextRequest {
  return new Request("http://localhost/api/filing/attachment/presign", {
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

describe("filing presign route", () => {
  it("401 when logged out", async () => {
    vi.mocked(getToken).mockResolvedValue(null as never);
    const res = await POST(req({ contentType: "application/pdf" }));
    expect(res.status).toBe(401);
  });

  it("enabled:false when R2 is unconfigured", async () => {
    asUser("filingA");
    const res = await POST(req({ contentType: "application/pdf" }));
    expect(await res.json()).toEqual({ enabled: false });
  });

  describe("with R2 configured", () => {
    beforeEach(() => {
      for (const [k, v] of Object.entries(R2)) vi.stubEnv(k, v);
    });

    it("derives a per-user path that differs across users (IDOR guard)", async () => {
      asUser("filingB");
      const a = await (
        await POST(req({ contentType: "application/pdf", documentId: "x" }))
      ).json();
      asUser("filingC");
      const b = await (
        await POST(req({ contentType: "application/pdf", documentId: "x" }))
      ).json();

      expect(a.path).toMatch(/^filing\/[a-f0-9]{16}\/x\//);
      expect(b.path).toMatch(/^filing\/[a-f0-9]{16}\/x\//);
      expect(a.path.split("/")[1]).not.toBe(b.path.split("/")[1]);
    });

    // The public bucket is a different origin, and both of these execute script
    // when served from it. The content type is signed, so refusing it here is
    // what keeps it out — the PUT cannot swap it afterwards.
    it("refuses SVG", async () => {
      asUser("filingD");
      const res = await POST(req({ contentType: "image/svg+xml" }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("unsupported_type");
    });

    it("refuses HTML", async () => {
      asUser("filingE");
      const res = await POST(req({ contentType: "text/html" }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("unsupported_type");
    });

    // A scan is usually a PDF — this is the substantive difference from the
    // inventory photo route, which takes images only.
    it("accepts a PDF", async () => {
      asUser("filingF");
      const res = await POST(req({ contentType: "application/pdf" }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.enabled).toBe(true);
      expect(json.path).toMatch(/\.pdf$/);
    });

    it("accepts the image types in the map", async () => {
      const seen: string[] = [];
      for (const [i, type] of (
        ["image/jpeg", "image/png", "image/webp", "image/heic"] as const
      ).entries()) {
        asUser(`filingImg${i}`);
        const json = await (await POST(req({ contentType: type }))).json();
        seen.push(json.path.split(".").pop());
      }
      expect(seen).toEqual(["jpg", "png", "webp", "heic"]);
    });

    // Filing defaults contentType to "" where the inventory route defaults to
    // "image/webp", so an empty body is rejected here rather than assumed to be
    // an image. Pinned because the two routes are otherwise near-identical and
    // this is the kind of difference that gets "harmonised" by mistake.
    it("400s an empty body rather than assuming a type", async () => {
      asUser("filingG");
      const res = await POST(req({}));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("unsupported_type");
    });

    it("413 above the declared-size cap, and accepts exactly the cap", async () => {
      asUser("filingH");
      const over = await POST(
        req({ contentType: "application/pdf", size: MAX_BYTES + 1 })
      );
      expect(over.status).toBe(413);
      expect(await over.json()).toMatchObject({
        error: "too_large",
        maxBytes: MAX_BYTES,
      });

      asUser("filingI");
      const exact = await POST(
        req({ contentType: "application/pdf", size: MAX_BYTES })
      );
      expect(exact.status).toBe(200);
    });

    it("sanitizes a path-traversal documentId", async () => {
      asUser("filingJ");
      const json = await (
        await POST(req({ contentType: "application/pdf", documentId: "../../etc" }))
      ).json();
      expect(json.path).not.toContain("..");
      expect(json.path.split("/")[2]).toBe("etc");
    });

    // A scan the browser already sealed: the route sees only its declared size, signs the
    // upload as octet-stream, and still refuses what could never be a scan.
    describe("a sealed (encrypted) upload", () => {
      it("is stored and SIGNED as octet-stream, under a .bin key, whatever the original was", async () => {
        asUser("sealA");
        const json = await (
          await POST(req({ contentType: "application/pdf", encrypted: true, size: 1000, documentId: "p1" }))
        ).json();
        expect(json.uploadContentType).toBe("application/octet-stream");
        expect(json.path).toMatch(/^filing\/[a-f0-9]{16}\/p1\/[0-9a-f-]+\.bin$/);
        // The signature covers it, so the PUT cannot swap the type afterwards.
        expect(new URL(json.uploadUrl).searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
      });

      it("still refuses SVG and HTML as the original type", async () => {
        asUser("sealB");
        for (const type of ["image/svg+xml", "text/html", ""]) {
          const res = await POST(req({ contentType: type, encrypted: true, size: 10 }));
          expect(res.status).toBe(400);
          expect((await res.json()).error).toBe("unsupported_type");
        }
      });

      it("allows the cap plus the seal's overhead, and not a byte more", async () => {
        asUser("sealC");
        const overhead = 12 + 16;
        const ok = await POST(req({ contentType: "application/pdf", encrypted: true, size: MAX_BYTES + overhead }));
        expect(ok.status).toBe(200);
        asUser("sealD");
        const over = await POST(req({ contentType: "application/pdf", encrypted: true, size: MAX_BYTES + overhead + 1 }));
        expect(over.status).toBe(413);
      });

      it("a plain upload gets no such allowance", async () => {
        asUser("sealE");
        const res = await POST(req({ contentType: "application/pdf", size: MAX_BYTES + 1 }));
        expect(res.status).toBe(413);
      });

      it("a plain upload is signed with its own type, as before", async () => {
        asUser("sealF");
        const json = await (await POST(req({ contentType: "image/png", size: 10 }))).json();
        expect(json.uploadContentType).toBe("image/png");
        expect(json.path).toMatch(/\.png$/);
      });
    });

    it("no longer needs R2_PUBLIC_BASE_URL, and hands back no public URL", async () => {
      vi.stubEnv("R2_PUBLIC_BASE_URL", "");
      asUser("noPublic");
      const json = await (await POST(req({ contentType: "application/pdf" }))).json();
      expect(json.enabled).toBe(true);
      expect(json).not.toHaveProperty("publicUrl");
    });

    it("signs into R2_FILING_BUCKET when set, else the shared bucket", async () => {
      asUser("bucketA");
      const shared = await (await POST(req({ contentType: "application/pdf" }))).json();
      expect(new URL(shared.uploadUrl).pathname.startsWith("/bucket/")).toBe(true);
      vi.stubEnv("R2_FILING_BUCKET", "filing-private");
      asUser("bucketB");
      const own = await (await POST(req({ contentType: "application/pdf" }))).json();
      expect(new URL(own.uploadUrl).pathname.startsWith("/filing-private/")).toBe(true);
    });

    it("429 after exceeding the per-user rate limit", async () => {
      asUser("filingK");
      let last: Response | undefined;
      for (let i = 0; i < 21; i++) {
        last = await POST(req({ contentType: "application/pdf" }));
      }
      expect(last?.status).toBe(429);
    });
  });
});
