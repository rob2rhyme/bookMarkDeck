import { describe, it, expect } from "vitest";
import { isUnsafeUrl, normalizeUrl } from "./normalizeUrl";

describe("normalizeUrl", () => {
  it("prefixes https:// for a schemeless host", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com");
    expect(normalizeUrl("example.com/path?q=1")).toBe(
      "https://example.com/path?q=1"
    );
  });

  it("preserves an existing http/https scheme (case-insensitive)", () => {
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
    expect(normalizeUrl("https://example.com")).toBe("https://example.com");
    expect(normalizeUrl("HTTPS://Example.com")).toBe("HTTPS://Example.com");
  });

  it("blocks dangerous / unsupported schemes by returning ''", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBe("");
    expect(normalizeUrl("  javascript:alert(1)  ")).toBe("");
    expect(normalizeUrl("data:text/html,<script>alert(1)</script>")).toBe("");
    expect(normalizeUrl("vbscript:msgbox(1)")).toBe("");
    expect(normalizeUrl("file:///etc/passwd")).toBe("");
    expect(normalizeUrl("mailto:a@b.com")).toBe("");
  });

  it("returns '' for empty / whitespace input", () => {
    expect(normalizeUrl("")).toBe("");
    expect(normalizeUrl("   ")).toBe("");
    // @ts-expect-error guarding against null at runtime
    expect(normalizeUrl(null)).toBe("");
  });

  it("makes protocol-relative URLs absolute https", () => {
    expect(normalizeUrl("//cdn.example.com/x")).toBe(
      "https://cdn.example.com/x"
    );
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeUrl("  example.com  ")).toBe("https://example.com");
  });
});

describe("isUnsafeUrl", () => {
  it.each(["javascript:alert(1)", " JAVASCRIPT:alert(1)", "java\tscript:alert(1)", "data:text/html,x", "vbscript:x"])(
    "flags %j",
    (url) => expect(isUnsafeUrl(url)).toBe(true)
  );
  it.each(["https://example.com", "http://x.test", "obsidian://open?vault=a", "mailto:a@b.c", "example.com", ""])(
    "allows %j",
    (url) => expect(isUnsafeUrl(url)).toBe(false)
  );
});
