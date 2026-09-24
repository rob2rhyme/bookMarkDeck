import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
import { getToken } from "next-auth/jwt";
import { POST } from "./route";

// isOwnedInventoryPath is unit-tested in features/inventory/lib/r2.test.ts. What
// that cannot show is whether this route actually CALLS it — drop the
// `.filter(...)` and every existing test still passes. So these assert on which
// keys reach `fetch`: a foreign prefix or another pillar's object must never get
// there. Mirrors the filing delete test; the two routes are identical apart from
// their prefix, so both need the wiring pinned independently.

const R2 = {
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "akid",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "bucket",
};

// Same derivation the route uses, so a test can address its own prefix.
const seg = (sub: string) =>
  createHash("sha256").update(sub).digest("hex").slice(0, 16);

function req(body: unknown): NextRequest {
  return new Request("http://localhost/api/inventory/object/delete", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function asUser(sub: string) {
  vi.mocked(getToken).mockResolvedValue({ sub } as never);
}

// The route presigns a DELETE per key and fetches it. Capture the keys rather
// than the URLs: the signed query string is the signer's business.
let fetchMock: ReturnType<typeof vi.fn>;

function deletedKeys(): string[] {
  return fetchMock.mock.calls.map((c) => {
    const u = new URL(String(c[0]));
    return decodeURIComponent(u.pathname).replace(/^\/[^/]+\//, "");
  });
}

beforeEach(() => {
  vi.mocked(getToken).mockReset();
  vi.stubEnv("NEXTAUTH_SECRET", "test");
  for (const k of Object.keys(R2)) vi.stubEnv(k, ""); // unconfigured by default
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 } as Response);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("inventory object delete route", () => {
  it("401 when logged out", async () => {
    vi.mocked(getToken).mockResolvedValue(null as never);
    const res = await POST(req({ paths: [] }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enabled:false when R2 is unconfigured", async () => {
    asUser("invA");
    const res = await POST(req({ paths: [`inventory/${seg("invA")}/i/x.webp`] }));
    expect(await res.json()).toEqual({ enabled: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("with R2 configured", () => {
    beforeEach(() => {
      for (const [k, v] of Object.entries(R2)) vi.stubEnv(k, v);
    });

    it("400 bad_request when paths is missing or not an array", async () => {
      asUser("invB");
      expect((await POST(req({}))).status).toBe(400);
      expect((await POST(req({ paths: "inventory/x" }))).status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("deletes a key inside the caller's own prefix", async () => {
      asUser("invC");
      const key = `inventory/${seg("invC")}/item1/a.webp`;
      const res = await POST(req({ paths: [key] }));
      expect(await res.json()).toEqual({ enabled: true, deleted: 1 });
      expect(deletedKeys()).toEqual([key]);
    });

    it("never deletes another user's object", async () => {
      asUser("invD");
      const mine = `inventory/${seg("invD")}/item/mine.webp`;
      const theirs = `inventory/${seg("someoneElse")}/item/theirs.webp`;
      const res = await POST(req({ paths: [mine, theirs] }));

      expect(deletedKeys()).toEqual([mine]);
      expect(await res.json()).toEqual({ enabled: true, deleted: 1 });
    });

    // The cross-pillar guard, at the route rather than the predicate: even with
    // the caller's OWN segment, a filing key must not be reachable here.
    it("never deletes a filing object, even under the caller's segment", async () => {
      asUser("invE");
      const s = seg("invE");
      const res = await POST(
        req({ paths: [`filing/${s}/doc/scan.pdf`, `inventory/${s}/item/ok.webp`] })
      );

      expect(deletedKeys()).toEqual([`inventory/${s}/item/ok.webp`]);
      expect(await res.json()).toEqual({ enabled: true, deleted: 1 });
    });

    it("rejects traversal and junk without touching fetch", async () => {
      asUser("invF");
      const s = seg("invF");
      await POST(
        req({
          paths: [
            `inventory/${s}/../../etc/passwd`,
            `inventory/${s}//double.webp`,
            `inventory/${s}/sp ace.webp`,
            `https://evil.example/inventory/${s}/x.webp`,
            42,
          ],
        })
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("dedupes repeated paths", async () => {
      asUser("invG");
      const key = `inventory/${seg("invG")}/item/dupe.webp`;
      const res = await POST(req({ paths: [key, key, key] }));
      expect(deletedKeys()).toEqual([key]);
      expect(await res.json()).toEqual({ enabled: true, deleted: 1 });
    });

    it("caps the batch at 25 keys", async () => {
      asUser("invH");
      const s = seg("invH");
      const paths = Array.from(
        { length: 40 },
        (_, i) => `inventory/${s}/item/${i}.webp`
      );
      const res = await POST(req({ paths }));
      expect(fetchMock).toHaveBeenCalledTimes(25);
      expect(await res.json()).toEqual({ enabled: true, deleted: 25 });
    });

    it("counts an already-gone key as deleted, and survives a network error", async () => {
      asUser("invI");
      const s = seg("invI");
      fetchMock
        .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
        .mockRejectedValueOnce(new Error("network"));

      const res = await POST(
        req({
          paths: [`inventory/${s}/item/gone.webp`, `inventory/${s}/item/boom.webp`],
        })
      );
      expect(await res.json()).toEqual({ enabled: true, deleted: 1 });
    });
  });
});
