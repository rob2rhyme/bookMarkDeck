import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHALLENGES,
  DEFAULT_QUOTES,
  isChallenge,
  isQuote,
  mergeContent,
} from "@/features/focus/lib/content";

describe("focus content validators", () => {
  it("isQuote accepts valid quotes, rejects junk", () => {
    expect(isQuote({ text: "hi", author: null })).toBe(true);
    expect(isQuote({ text: "hi", author: "x" })).toBe(true);
    expect(isQuote({ text: "" })).toBe(false);
    expect(isQuote({ author: "x" })).toBe(false);
    expect(isQuote(null)).toBe(false);
  });

  it("isChallenge enforces the level enum", () => {
    expect(isChallenge({ level: "Easy", prompt: "p" })).toBe(true);
    expect(isChallenge({ level: "Insane", prompt: "p" })).toBe(false);
    expect(isChallenge({ level: "Hard", prompt: "" })).toBe(false);
  });
});

describe("mergeContent", () => {
  it("returns the defaults when there are no extras", () => {
    const merged = mergeContent(null);
    expect(merged.quotes).toHaveLength(DEFAULT_QUOTES.length);
    expect(merged.challenges).toHaveLength(DEFAULT_CHALLENGES.length);
  });

  it("appends valid extras and drops invalid + duplicate ones", () => {
    const merged = mergeContent({
      quotes: [
        { text: "A brand new thought", author: null }, // kept
        { text: DEFAULT_QUOTES[0].text, author: "dup" }, // duplicate text → dropped
        { text: "" }, // invalid → dropped
        42, // invalid → dropped
      ],
      challenges: [{ level: "Easy", prompt: "New challenge" }],
    });
    expect(merged.quotes).toHaveLength(DEFAULT_QUOTES.length + 1);
    expect(merged.quotes.some((q) => q.text === "A brand new thought")).toBe(true);
    expect(merged.challenges).toHaveLength(DEFAULT_CHALLENGES.length + 1);
  });
});
