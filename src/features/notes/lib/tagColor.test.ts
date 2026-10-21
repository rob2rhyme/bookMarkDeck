import { describe, expect, it } from "vitest";

import { TAG_TONE_COUNT, tagTone } from "./tagColor";

describe("tagTone", () => {
  it("gives the same tag the same tone every time", () => {
    expect(tagTone("work")).toBe(tagTone("work"));
    expect(tagTone("work/clients")).toBe(tagTone("work/clients"));
  });

  it("spreads ordinary tags over the whole palette", () => {
    const tags = ["work", "home", "ideas", "recipes", "travel", "money", "health", "reading", "todo", "later", "school", "garden", "car", "pets", "music", "gifts"];
    const used = new Set(tags.map((t) => tagTone(t).soft));
    // Not a guarantee of evenness, but a palette that collapsed onto two or
    // three colours would make the ribbon pointless.
    expect(used.size).toBeGreaterThanOrEqual(Math.ceil(TAG_TONE_COUNT * 0.6));
  });

  it("copes with non-Latin tags", () => {
    expect(() => tagTone("仕事")).not.toThrow();
    expect(tagTone("仕事")).toBe(tagTone("仕事"));
  });
});
