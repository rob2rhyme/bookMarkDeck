import { describe, expect, it } from "vitest";

import { awsUriEncode, presignR2Put, signingKey } from "@/features/inventory/lib/r2";

describe("signingKey", () => {
  it("matches an independent computation of the SigV4 HMAC chain", () => {
    // Reference computed separately with node:crypto for the standard AWS
    // example inputs — verifies our derivation (prefix, chain order, region/
    // service steps) against a spec-following implementation, not itself.
    const key = signingKey(
      "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      "20150830",
      "us-east-1",
      "iam"
    );
    expect(key.toString("hex")).toBe(
      "2c94c0cf5378ada6887f09bb697df8fc0affdb34ba1cdd5bda32b664bd55b73c"
    );
  });
});

describe("awsUriEncode", () => {
  it("encodes reserved chars but keeps unreserved (and / when asked)", () => {
    expect(awsUriEncode("a b+c")).toBe("a%20b%2Bc");
    expect(awsUriEncode("x/y", true)).toBe("x%2Fy");
    expect(awsUriEncode("x/y", false)).toBe("x/y");
    expect(awsUriEncode("A-Z_a.z~0")).toBe("A-Z_a.z~0");
  });
});

describe("presignR2Put", () => {
  const base = {
    accountId: "acct123",
    bucket: "mystuff",
    key: "inventory/ab/it1/photo.webp",
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "secret",
    now: new Date("2026-07-14T17:39:38.000Z"),
    expiresSeconds: 300,
  };

  it("produces a well-formed, deterministic presigned URL", () => {
    const url = presignR2Put(base);
    expect(url.startsWith("https://acct123.r2.cloudflarestorage.com/mystuff/inventory/ab/it1/photo.webp?")).toBe(true);
    expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(url).toContain("X-Amz-Credential=AKIDEXAMPLE%2F20260714%2Fauto%2Fs3%2Faws4_request");
    expect(url).toContain("X-Amz-Date=20260714T173938Z");
    expect(url).toContain("X-Amz-Expires=300");
    expect(url).toContain("X-Amz-SignedHeaders=host");
    expect(url).toMatch(/X-Amz-Signature=[0-9a-f]{64}$/);
    // deterministic for the same inputs
    expect(presignR2Put(base)).toBe(url);
  });

  it("changes the signature when the key changes", () => {
    const a = presignR2Put(base);
    const b = presignR2Put({ ...base, key: "inventory/ab/it1/other.webp" });
    expect(a).not.toBe(b);
  });
});
