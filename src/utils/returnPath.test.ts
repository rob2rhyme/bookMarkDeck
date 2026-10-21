import { describe, expect, it } from "vitest";

import { returnPath } from "./returnPath";

const ORIGIN = "https://deck.example";

describe("returnPath", () => {
  it("keeps a page on this site, with its query", () => {
    expect(returnPath("https://deck.example/share?url=https%3A%2F%2Fa.com", ORIGIN)).toBe(
      "/share?url=https%3A%2F%2Fa.com"
    );
    expect(returnPath("/notes?q=milk", ORIGIN)).toBe("/notes?q=milk");
  });

  it("sends anything off-site home", () => {
    for (const raw of [
      "https://evil.example/",
      "//evil.example/x",
      "/\\evil.example",
      "javascript:alert(1)",
      "http://deck.example/",
    ]) {
      expect(returnPath(raw, ORIGIN)).toBe("/");
    }
  });

  it("goes home when there is nothing usable, or it points back at login", () => {
    expect(returnPath(null, ORIGIN)).toBe("/");
    expect(returnPath("", ORIGIN)).toBe("/");
    expect(returnPath("/login?error=x", ORIGIN)).toBe("/");
  });
});
