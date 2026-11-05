import { describe, expect, it } from "vitest";
import {
  assertDocFits,
  docBytes,
  DocTooLargeError,
  formatBytes,
  MAX_DOC_BYTES,
  utf8Length,
  valueSize,
} from "./docSize";

describe("docBytes", () => {
  it("matches the worked example in Firestore's storage-size docs (147 bytes)", () => {
    const path = ["users", "jeff", "tasks", "my_task_id"];
    const data = { type: "Personal", done: false, priority: 1, description: "Learn Cloud Firestore" };
    expect(docBytes(path, data)).toBe(147);
  });

  it("skips undefined fields, which are never written", () => {
    expect(docBytes(["c", "d"], { a: 1, b: undefined })).toBe(docBytes(["c", "d"], { a: 1 }));
  });
});

describe("valueSize", () => {
  it("counts strings in UTF-8 bytes plus one", () => {
    expect(valueSize("abc")).toBe(4);
    expect(valueSize("é")).toBe(3);
    expect(valueSize("日本")).toBe(7);
    expect(valueSize("😀")).toBe(5);
  });

  it("counts scalars, arrays and maps (maps carry a document's overhead, erring high)", () => {
    expect(valueSize(null)).toBe(1);
    expect(valueSize(true)).toBe(1);
    expect(valueSize(3.5)).toBe(8);
    expect(valueSize(new Date())).toBe(8);
    expect(valueSize(["a", "b"])).toBe(4);
    expect(valueSize({ a: "x" })).toBe(32 + 2 + 2);
    expect(valueSize(new Uint8Array(10))).toBe(10);
  });

  it("counts a sentinel or Timestamp-like object as 8", () => {
    class Sentinel {
      readonly _methodName = "serverTimestamp";
    }
    expect(valueSize(new Sentinel())).toBe(8);
  });
});

describe("utf8Length", () => {
  it("agrees with TextEncoder, lone surrogates included", () => {
    const enc = new TextEncoder();
    for (const s of ["", "plain", "naïve café", "中文字符", "a😀b", "\ud800x", "x\udc00"]) {
      expect(utf8Length(s)).toBe(enc.encode(s).length);
    }
  });
});

describe("assertDocFits", () => {
  const path = ["users", "u", "notes", "n"];
  const overhead = docBytes(path, { body: "" });

  it("passes a document exactly at the limit and refuses one byte over", () => {
    const at = "x".repeat(MAX_DOC_BYTES - overhead);
    expect(() => assertDocFits(path, { body: at }, "This note", "Shorten it.")).not.toThrow();
    expect(() => assertDocFits(path, { body: at + "x" }, "This note", "Shorten it.")).toThrow(DocTooLargeError);
  });

  it("says what, how big, and what to do — and carries a code the offline queue retries rather than drops", () => {
    try {
      assertDocFits(path, { body: "x".repeat(MAX_DOC_BYTES) }, "This note", "Shorten it.");
      throw new Error("expected a refusal");
    } catch (e) {
      expect(e).toBeInstanceOf(DocTooLargeError);
      const err = e as DocTooLargeError;
      expect(err.code).toBe("doc-too-large");
      expect(err.message).toMatch(/^This note is 1\.\d\d MB, and one saved record holds up to 1 MB\. Shorten it\.$/);
    }
  });
});

describe("formatBytes", () => {
  it("shows KB below a megabyte and two decimals above", () => {
    expect(formatBytes(1500)).toBe("2 KB");
    expect(formatBytes(1_200_000)).toBe("1.14 MB");
  });
});
