import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Completing a repeating to-do files the next one, and the Undo that follows
// (called seconds later, from the render the completion happened in) has to take
// it back. That second part is what only a hook test can show: a toggle that
// decides from the list it saw when it was created would, on Undo, see the item
// as still open and complete it again.
vi.mock("@/features/focus/data/focusData", () => ({
  saveTodo: vi.fn(async () => {}),
  deleteTodo: vi.fn(async () => {}),
  fetchTodos: vi.fn(async () => []),
  subscribeTodos: vi.fn(() => () => {}),
}));

import { useTodos } from "./useTodos";
import { dayKeyFor } from "@/lib/dayKey";

const EMAIL = "a@example.com";

function setup() {
  const hook = renderHook(() => useTodos(EMAIL, false));
  const addWeekly = () => {
    let id = "";
    act(() => {
      const t = hook.result.current.addTodo(
        "Water the plants",
        new Date().toISOString(),
        "- [x] hose",
        "personal",
        "",
        { repeat: "weekly", priority: "high" }
      );
      id = t!.id;
    });
    return id;
  };
  return { hook, addWeekly };
}

beforeEach(() => window.localStorage.clear());

describe("recurring to-dos", () => {
  it("files the next occurrence when a repeating to-do is completed", () => {
    const { hook, addWeekly } = setup();
    const id = addWeekly();

    let out!: ReturnType<typeof hook.result.current.toggleTodo>;
    act(() => {
      out = hook.result.current.toggleTodo(id);
    });

    expect(out.spawned).not.toBeNull();
    const all = hook.result.current.todos;
    expect(all).toHaveLength(2);
    expect(all.find((t) => t.id === id)).toMatchObject({ done: true });
    const next = all.find((t) => t.id === out.spawned!.id)!;
    expect(next).toMatchObject({ done: false, repeat: "weekly", priority: "high", note: "- hose" });
    expect(dayKeyFor(new Date(next.dueAt!)) > dayKeyFor(new Date())).toBe(true);
    // Both are cached, so a reload keeps them.
    const cached = JSON.parse(window.localStorage.getItem(`bookmarkdeck:focus:todos:v1:${EMAIL}`)!);
    expect(cached).toHaveLength(2);
  });

  it("takes the next occurrence back on Undo, even from a stale callback", () => {
    const { hook, addWeekly } = setup();
    const id = addWeekly();
    const staleToggle = hook.result.current.toggleTodo; // as the Undo toast holds it

    act(() => {
      staleToggle(id);
    });
    expect(hook.result.current.todos).toHaveLength(2);

    let back!: ReturnType<typeof staleToggle>;
    act(() => {
      back = staleToggle(id);
    });
    expect(back.removed).not.toBeNull();
    expect(hook.result.current.todos).toHaveLength(1);
    expect(hook.result.current.todos[0]).toMatchObject({ id, done: false, completedAt: null });
  });

  it("keeps the next occurrence when it has already been completed itself", () => {
    const { hook, addWeekly } = setup();
    const id = addWeekly();
    let spawnedId = "";
    act(() => {
      spawnedId = hook.result.current.toggleTodo(id).spawned!.id;
    });
    act(() => {
      hook.result.current.toggleTodo(spawnedId); // done, and files a third
    });
    act(() => {
      hook.result.current.toggleTodo(id); // un-complete the first
    });
    expect(hook.result.current.todos.some((t) => t.id === spawnedId && t.done)).toBe(true);
  });

  it("does not file anything for a to-do that doesn't repeat", () => {
    const { hook } = setup();
    let id = "";
    act(() => {
      id = hook.result.current.addTodo("One-off", new Date().toISOString())!.id;
    });
    let out!: ReturnType<typeof hook.result.current.toggleTodo>;
    act(() => {
      out = hook.result.current.toggleTodo(id);
    });
    expect(out.spawned).toBeNull();
    expect(hook.result.current.todos).toHaveLength(1);
  });

  it("ignores a repeat on a to-do with no due date, and drops it when the date is cleared", () => {
    const { hook, addWeekly } = setup();
    let bare = "";
    act(() => {
      bare = hook.result.current.addTodo("No date", null, "", "personal", "", { repeat: "daily" })!.id;
    });
    expect(hook.result.current.todos.find((t) => t.id === bare)!.repeat).toBeUndefined();

    const id = addWeekly();
    act(() => hook.result.current.editTodo(id, { dueAt: null }));
    expect(hook.result.current.todos.find((t) => t.id === id)!.repeat).toBeUndefined();
  });

  it("clears priority with null and leaves it with undefined", () => {
    const { hook, addWeekly } = setup();
    const id = addWeekly();
    act(() => hook.result.current.editTodo(id, { text: "Water everything" }));
    expect(hook.result.current.todos[0].priority).toBe("high");
    act(() => hook.result.current.editTodo(id, { priority: null }));
    expect(hook.result.current.todos[0].priority).toBeUndefined();
  });
});
