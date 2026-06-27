import { describe, expect, it } from "vitest";

import { QUIZZES } from "@/features/focus/lib/quizBank";
import { isTopicId } from "@/features/focus/lib/topics";

describe("quiz bank integrity", () => {
  it("every quiz is well-formed", () => {
    for (const q of QUIZZES) {
      expect(isTopicId(q.topic), `bad topic: ${q.topic}`).toBe(true);
      expect(["Easy", "Medium", "Hard"]).toContain(q.level);
      expect(q.question.trim().length, q.question).toBeGreaterThan(0);
      // 2–4 distinct, non-empty choices
      expect(q.choices.length, q.question).toBeGreaterThanOrEqual(2);
      expect(q.choices.length, q.question).toBeLessThanOrEqual(4);
      for (const c of q.choices) expect(c.trim().length, q.question).toBeGreaterThan(0);
      expect(new Set(q.choices).size, `duplicate choice in: ${q.question}`).toBe(
        q.choices.length
      );
      // answer indexes a real choice
      expect(Number.isInteger(q.answer), q.question).toBe(true);
      expect(q.answer, q.question).toBeGreaterThanOrEqual(0);
      expect(q.answer, q.question).toBeLessThan(q.choices.length);
    }
  });

  it("has no exact-duplicate questions (same prompt AND choices)", () => {
    // Keyed on prompt + choices so genuinely distinct questions that share a
    // generic prompt (e.g. "Which is the correct spelling?" with different word
    // sets) are allowed, while copy-paste duplicates are caught.
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const q of QUIZZES) {
      const key = `${q.topic}::${q.question.trim().toLowerCase()}::${q.choices.join("|")}`;
      if (seen.has(key)) dupes.push(q.question);
      seen.add(key);
    }
    expect(dupes, `duplicates: ${dupes.slice(0, 5).join(" | ")}`).toEqual([]);
  });

  it("grew the Hard bank and covers the new areas", () => {
    const hard = QUIZZES.filter((q) => q.level === "Hard").length;
    expect(hard).toBeGreaterThan(250); // was 67 before the expansion
    const topics = new Set(QUIZZES.map((q) => q.topic));
    for (const t of ["tech", "economics", "literature", "film", "sports", "mythology"]) {
      expect(topics.has(t as never), `missing area: ${t}`).toBe(true);
    }
  });
});
