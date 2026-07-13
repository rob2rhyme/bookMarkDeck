// Quick-search filtering for the to-do list. Pure + framework-free so it can be
// unit-tested and reused by the Personal and Project lists alike.

import type { Todo } from "@/features/focus/lib/types";

/** Case-insensitive substring match across a to-do's text, note, and project
 *  name. An empty/whitespace query matches everything (search inactive). */
export function todoMatchesQuery(todo: Todo, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    todo.text.toLowerCase().includes(q) ||
    (todo.note ?? "").toLowerCase().includes(q) ||
    (todo.project ?? "").toLowerCase().includes(q)
  );
}

/** Filter a list of to-dos by the quick-search query, preserving order. An
 *  empty/whitespace query returns the list unchanged. */
export function filterTodos(todos: Todo[], query: string): Todo[] {
  if (!query.trim()) return todos;
  return todos.filter((t) => todoMatchesQuery(t, query));
}
