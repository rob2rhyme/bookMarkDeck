import { describe, expect, it } from "vitest";

import { filingStorage, presignFilingGet, READ_URL_SECONDS } from "@/features/filing/lib/filingStorage";
import { presignR2Put } from "@/features/filing/lib/r2";

const ENV = { R2_ACCOUNT_ID: "acct", R2_ACCESS_KEY_ID: "akid", R2_SECRET_ACCESS_KEY: "secret", R2_BUCKET: "shared" };

describe("filingStorage", () => {
  it("is null until every credential and a bucket is present", () => {
    expect(filingStorage({})).toBeNull();
    for (const missing of Object.keys(ENV)) {
      const partial = { ...ENV, [missing]: undefined };
      expect(filingStorage(partial), missing).toBeNull();
    }
  });

  it("uses the shared bucket by default", () => {
    expect(filingStorage(ENV)?.bucket).toBe("shared");
  });

  it("prefers R2_FILING_BUCKET — and works with only that one set", () => {
    expect(filingStorage({ ...ENV, R2_FILING_BUCKET: "private" })?.bucket).toBe("private");
    const { R2_BUCKET: _unused, ...rest } = ENV;
    void _unused;
    expect(filingStorage({ ...rest, R2_FILING_BUCKET: "private" })?.bucket).toBe("private");
  });

  it("an empty R2_FILING_BUCKET falls back rather than naming no bucket", () => {
    expect(filingStorage({ ...ENV, R2_FILING_BUCKET: "" })?.bucket).toBe("shared");
  });
});

describe("presignFilingGet", () => {
  it("signs a GET that expires in two minutes, deterministically for a fixed clock", () => {
    const storage = filingStorage(ENV)!;
    const now = new Date("2026-11-05T12:00:00.000Z");
    const a = presignFilingGet(storage, "filing/abc/d/x.bin", now);
    expect(a).toBe(presignFilingGet(storage, "filing/abc/d/x.bin", now));
    const u = new URL(a);
    expect(READ_URL_SECONDS).toBe(120);
    expect(u.searchParams.get("X-Amz-Expires")).toBe("120");
    expect(u.searchParams.get("X-Amz-Date")).toBe("20261105T120000Z");
    expect(u.pathname).toBe("/shared/filing/abc/d/x.bin");
  });

  it("a GET URL is not a PUT URL: the method is part of what is signed", () => {
    const storage = filingStorage(ENV)!;
    const now = new Date("2026-11-05T12:00:00.000Z");
    const get = new URL(presignFilingGet(storage, "filing/abc/d/x.bin", now));
    // The same request signed for PUT differs in its signature.
    const put = new URL(presignR2Put({ ...storage, key: "filing/abc/d/x.bin", now, expiresSeconds: 120 }));
    expect(get.searchParams.get("X-Amz-Signature")).not.toBe(put.searchParams.get("X-Amz-Signature"));
  });
});
