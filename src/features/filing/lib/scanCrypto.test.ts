import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PBKDF2_ITERATIONS, createVault, vaultIterationLimits } from "@/lib/vault/vault";
import { LOCKED_SCAN_NAME, openScan, openScanName, sealScan, sealedSize } from "@/features/filing/lib/scanCrypto";

beforeAll(() => {
  vaultIterationLimits.min = 1_000;
});
afterAll(() => {
  vaultIterationLimits.min = PBKDF2_ITERATIONS;
});

const SECRET = "SSN 123-45-6789 — Jane Doe";
const file = (name = "Jane Doe SSN card.pdf", type = "application/pdf") =>
  new File([new TextEncoder().encode(SECRET)], name, { type });
const read = (b: Blob) => b.arrayBuffer();

async function vault() {
  const { record, key } = await createVault("pw-pw-pw-pw", { iterations: 1_000 });
  return { kid: record.id, key };
}

describe("sealScan / openScan", () => {
  it("stores nothing readable — neither the bytes nor the file name — and opens again with the key", async () => {
    const { kid, key } = await vault();
    const sealed = await sealScan({ file: file(), key, kid, attachmentId: "a1" });

    const stored = new TextDecoder("latin1").decode(await read(sealed.blob));
    expect(stored).not.toContain("123-45-6789");
    expect(JSON.stringify(sealed.enc)).not.toContain("Jane");
    expect(sealed.blob.type).toBe("application/octet-stream");
    expect(sealed.blob.size).toBe(sealedSize(file().size));
    expect(sealed.enc.kid).toBe(kid);

    const opened = await openScan({
      sealed: await read(sealed.blob),
      key,
      attachment: { id: "a1", contentType: "application/pdf", enc: sealed.enc, name: LOCKED_SCAN_NAME },
    });
    expect(opened.name).toBe("Jane Doe SSN card.pdf");
    expect(opened.contentType).toBe("application/pdf");
    expect(new TextDecoder().decode(await read(opened.blob))).toBe(SECRET);
  });

  it("is bound to the attachment: the same bytes under another pointer do not open", async () => {
    const { kid, key } = await vault();
    const sealed = await sealScan({ file: file(), key, kid, attachmentId: "a1" });
    await expect(
      openScan({
        sealed: await read(sealed.blob),
        key,
        attachment: { id: "a2", contentType: "application/pdf", enc: sealed.enc, name: "x" },
      })
    ).rejects.toThrow();
  });

  it("a different vault's key does not open it", async () => {
    const a = await vault();
    const b = await vault();
    const sealed = await sealScan({ file: file(), key: a.key, kid: a.kid, attachmentId: "a1" });
    await expect(
      openScan({
        sealed: await read(sealed.blob),
        key: b.key,
        attachment: { id: "a1", contentType: "application/pdf", enc: sealed.enc, name: "x" },
      })
    ).rejects.toThrow();
  });

  it("hands decrypted bytes a type only if Filing accepts it — a tampered pointer cannot make them a page", async () => {
    const { kid, key } = await vault();
    const sealed = await sealScan({ file: file("x.html", "text/html"), key, kid, attachmentId: "a1" });
    const opened = await openScan({
      sealed: await read(sealed.blob),
      key,
      attachment: { id: "a1", contentType: "text/html", enc: sealed.enc, name: "x" },
    });
    expect(opened.contentType).toBe("application/octet-stream");
    expect(opened.blob.type).toBe("application/octet-stream");
  });

  it("truncates a very long file name before sealing it", async () => {
    const { kid, key } = await vault();
    const long = "n".repeat(300) + ".pdf";
    const sealed = await sealScan({ file: file(long), key, kid, attachmentId: "a1" });
    const name = await openScanName(key, { id: "a1", enc: sealed.enc });
    expect(name?.length).toBe(120);
  });
});

describe("openScanName", () => {
  it("is null for a scan that was never sealed, and for the wrong key", async () => {
    const a = await vault();
    const b = await vault();
    expect(await openScanName(a.key, { id: "a1", enc: null })).toBeNull();
    const sealed = await sealScan({ file: file(), key: a.key, kid: a.kid, attachmentId: "a1" });
    expect(await openScanName(b.key, { id: "a1", enc: sealed.enc })).toBeNull();
    expect(await openScanName(a.key, { id: "other", enc: sealed.enc })).toBeNull();
  });
});
