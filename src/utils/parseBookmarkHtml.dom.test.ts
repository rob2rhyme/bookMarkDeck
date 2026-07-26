import { describe, it, expect } from "vitest";
import { parseBookmarkHtml } from "./parseBookmarkHtml";

// jsdom project — parseBookmarkHtml uses DOMParser, which node lacks.
describe("parseBookmarkHtml", () => {
  it("extracts a link's title and (absolute) url", () => {
    const out = parseBookmarkHtml(
      `<DL><DT><A HREF="https://example.com">Example</A></DL>`
    );
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("https://example.com/");
    expect(out[0].title).toBe("Example");
    expect(out[0].tags).toEqual([]);
  });

  it("falls back to the href when the anchor has no text", () => {
    const out = parseBookmarkHtml(`<A HREF="https://no-text.example.com/"></A>`);
    expect(out[0].title).toBe("https://no-text.example.com/");
  });

  it("attributes a bookmark to the nearest ancestor H3 folder", () => {
    const out = parseBookmarkHtml(
      `<div><h3>Work</h3><a href="https://job.example.com">Job</a></div>`
    );
    const job = out.find((b) => b.url.includes("job.example.com"));
    expect(job?.folder).toBe("Work");
  });

  it("returns [] when there are no links", () => {
    expect(parseBookmarkHtml("<p>nothing here</p>")).toEqual([]);
  });
});
