import { describe, expect, it } from "vitest";

import { filterTodos, todoMatchesQuery } from "@/features/focus/lib/todoSearch";
import type { Todo } from "@/features/focus/lib/types";

function makeTodo(over: Partial<Todo>): Todo {
  return {
    id: "1",
    text: "",
    note: "",
    done: false,
    dueAt: null,
    createdAt: null,
    day: "2026-07-13",
    list: "personal",
    project: "",
    ...over,
  };
}

describe("todoMatchesQuery", () => {
  it("treats an empty or whitespace query as a match", () => {
    const t = makeTodo({ text: "Buy milk" });
    expect(todoMatchesQuery(t, "")).toBe(true);
    expect(todoMatchesQuery(t, "   ")).toBe(true);
  });

  it("matches the to-do text case-insensitively", () => {
    const t = makeTodo({ text: "Buy Milk" });
    expect(todoMatchesQuery(t, "milk")).toBe(true);
    expect(todoMatchesQuery(t, "MILK")).toBe(true);
    expect(todoMatchesQuery(t, "eggs")).toBe(false);
  });

  it("matches on the note and project fields too", () => {
    const t = makeTodo({
      text: "Fix login",
      note: "handle expired tokens",
      list: "project",
      project: "Bookmark Deck",
    });
    expect(todoMatchesQuery(t, "token")).toBe(true);
    expect(todoMatchesQuery(t, "deck")).toBe(true);
    expect(todoMatchesQuery(t, "logout")).toBe(false);
  });

  it("ignores surrounding whitespace in the query", () => {
    const t = makeTodo({ text: "Water the plants" });
    expect(todoMatchesQuery(t, "  plants  ")).toBe(true);
  });

  it("tolerates missing note/project fields", () => {
    const t = makeTodo({ text: "Standalone", note: undefined, project: undefined });
    expect(todoMatchesQuery(t, "stand")).toBe(true);
    expect(todoMatchesQuery(t, "missing")).toBe(false);
  });
});

describe("filterTodos", () => {
  const todos = [
    makeTodo({ id: "a", text: "Buy milk" }),
    makeTodo({ id: "b", text: "Fix login", note: "token refresh" }),
    makeTodo({ id: "c", text: "Read book", project: "Reading" }),
  ];

  it("returns the same array reference when the query is empty", () => {
    expect(filterTodos(todos, "")).toBe(todos);
    expect(filterTodos(todos, "   ")).toBe(todos);
  });

  it("keeps only matching to-dos and preserves order", () => {
    const result = filterTodos(todos, "o"); // login, book, token, ...
    expect(result.map((t) => t.id)).toEqual(["b", "c"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterTodos(todos, "zzz")).toEqual([]);
  });
});
