import { describe, expect, it } from "vitest";

import { backupCount, focusFromJson, focusToJson } from "./exportFocus";
import type { FocusBackup } from "./types";

const backup: FocusBackup = {
  sessions: [
    {
      id: "s1",
      focusMin: 25,
      day: "2026-01-02",
      taskId: "t1",
      createdAt: "2026-01-02T09:00:00.000Z",
      intention: "deep work",
    },
  ],
  tasks: [{ id: "t1", text: "Write", done: false, lastUsedAt: null }],
  notes: [
    {
      id: "n1",
      day: "2026-01-02",
      text: "Flew over a city",
      createdAt: "2026-01-02T07:00:00.000Z",
      kind: "dream",
      lucid: true,
    },
  ],
  moods: [{ day: "2026-01-02", mood: "good" }],
  hydration: [{ day: "2026-01-02", cups: 6 }],
  todos: [
    {
      id: "td1",
      text: "Email",
      note: "",
      done: false,
      dueAt: null,
      createdAt: null,
      day: "2026-01-02",
      googleTaskId: null,
      googleEventId: null,
    },
  ],
  scores: [
    {
      id: "sc1",
      topic: "math",
      level: "Easy",
      correct: true,
      points: 10,
      question: "1 + 1?",
      day: "2026-01-02",
      createdAt: "2026-01-02T10:00:00.000Z",
    },
  ],
};

describe("focus export → import round-trip", () => {
  it("preserves every collection through JSON", () => {
    const json = focusToJson(backup, "2026-01-03T00:00:00.000Z");
    const parsed = focusFromJson(json);
    expect(parsed).not.toBeNull();
    expect(backupCount(parsed!)).toBe(7);
    expect(parsed!.sessions[0]).toMatchObject({ id: "s1", intention: "deep work" });
    expect(parsed!.notes[0]).toMatchObject({ kind: "dream", lucid: true });
    expect(parsed!.moods[0]).toEqual({ day: "2026-01-02", mood: "good" });
    expect(parsed!.scores[0].points).toBe(10);
  });

  it("keeps a to-do's repeat, priority, list and completion through a backup", () => {
    const repeating = {
      ...backup.todos[0],
      id: "td2",
      done: true,
      dueAt: "2026-01-05T14:00:00.000Z",
      completedAt: "2026-01-05T20:00:00.000Z",
      list: "project" as const,
      project: "Garden",
      repeat: "weekly" as const,
      priority: "high" as const,
    };
    const parsed = focusFromJson(focusToJson({ ...backup, todos: [repeating] }, "2026-01-03T00:00:00.000Z"));
    expect(parsed!.todos[0]).toMatchObject({
      repeat: "weekly",
      priority: "high",
      list: "project",
      project: "Garden",
      completedAt: "2026-01-05T20:00:00.000Z",
    });
    // Junk values are dropped, not carried.
    const junk = JSON.stringify({ todos: [{ id: "x", text: "t", repeat: "hourly", priority: "urgent" }] });
    const bad = focusFromJson(junk)!.todos[0];
    expect(bad.repeat).toBeUndefined();
    expect(bad.priority).toBeUndefined();
  });

  it("rejects junk and empty payloads", () => {
    expect(focusFromJson("not json")).toBeNull();
    expect(focusFromJson("{}")).toBeNull();
  });

  it("drops malformed records (bad mood key, bad day)", () => {
    const json = JSON.stringify({
      moods: [{ day: "2026-01-02", mood: "nope" }],
      hydration: [{ day: "bad", cups: 3 }],
      tasks: [{ id: "t", text: "ok", done: false }],
    });
    const parsed = focusFromJson(json);
    expect(parsed!.moods).toHaveLength(0);
    expect(parsed!.hydration).toHaveLength(0);
    expect(parsed!.tasks).toHaveLength(1);
  });
});
