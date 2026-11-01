import { describe, expect, it } from "vitest";

import { parseSharedLink, sameLink } from "./sharedLink";

describe("parseSharedLink", () => {
  it("takes the url field when it is a web link", () => {
    expect(parseSharedLink({ title: "Docs", url: "https://example.com/docs" })).toEqual({
      url: "https://example.com/docs",
      title: "Docs",
    });
  });

  // Chrome on Android: title + the link inside text, url empty.
  it("finds the link inside text when url is empty", () => {
    expect(
      parseSharedLink({ title: "A page", text: "https://example.com/a?b=1", url: "" })
    ).toEqual({ url: "https://example.com/a?b=1", title: "A page" });
  });

  it("uses the words around a link in text as the title when none is given", () => {
    expect(parseSharedLink({ text: "Great read: https://example.com/post." })).toEqual({
      url: "https://example.com/post",
      title: "Great read:",
    });
  });

  it("falls back to the host for a bare link", () => {
    expect(parseSharedLink({ text: "https://www.example.com/x" })).toEqual({
      url: "https://www.example.com/x",
      title: "example.com",
    });
  });

  it("refuses a share with no web link", () => {
    expect(parseSharedLink({ title: "Hi", text: "just some words" })).toBeNull();
    expect(parseSharedLink({ url: "javascript:alert(1)" })).toBeNull();
    expect(parseSharedLink({ text: "data:text/html,<b>x</b>" })).toBeNull();
    expect(parseSharedLink({})).toBeNull();
  });

  it("caps a long title", () => {
    const parsed = parseSharedLink({ title: "x".repeat(500), url: "https://example.com" });
    expect(parsed?.title).toHaveLength(200);
  });
});

describe("sameLink", () => {
  it("ignores a trailing slash, a fragment and host case", () => {
    expect(sameLink("https://Example.com/a/", "https://example.com/a#top")).toBe(true);
    expect(sameLink("https://example.com/a", "https://example.com/b")).toBe(false);
  });
});
