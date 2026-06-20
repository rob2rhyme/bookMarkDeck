"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type ActivityType,
  deleteTodo,
  fetchTodos,
  saveTodo,
  subscribeTodos,
  todayKey,
} from "@/features/focus/data/focusData";
import type { Todo } from "@/features/focus/lib/types";

type LogActivity = (type: ActivityType, summary: string) => void;

const BASE_KEY = "bookmarkdeck:focus:todos:v1";

function keyFor(email?: string | null) {
  return email ? `${BASE_KEY}:${email}` : BASE_KEY;
}

function loadLocal(email?: string | null): Todo[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t) => t && typeof t.id === "string")
      .map((t) => ({
        id: t.id as string,
        text: typeof t.text === "string" ? t.text : "",
        note: typeof t.note === "string" ? t.note : "",
        done: Boolean(t.done),
        dueAt: typeof t.dueAt === "string" ? t.dueAt : null,
        createdAt: typeof t.createdAt === "string" ? t.createdAt : null,
        day: typeof t.day === "string" ? t.day : "",
      }))
      .filter((t) => t.text.trim().length > 0);
  } catch {
    return [];
  }
}

/**
 * To-do list: checklist items with an optional due date. Incomplete items
 * persist (roll over) across days. localStorage cache + live Firestore sync;
 * adds/completes are mirrored to the activity log.
 */
export function useTodos(
  email?: string | null,
  connected = false,
  onLog?: LogActivity
) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const canSync = connected && Boolean(email);

  useEffect(() => {
    setTodos(loadLocal(email));
    setHydrated(true);
  }, [email]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(keyFor(email), JSON.stringify(todos));
    } catch {}
  }, [todos, hydrated, email]);

  const pushToCloud = useCallback(async () => {
    if (!canSync || !email) return;
    await Promise.all(todos.map((t) => saveTodo(email, t)));
  }, [canSync, email, todos]);

  const pullFromCloud = useCallback(async () => {
    if (!canSync || !email) return;
    setTodos(await fetchTodos(email));
  }, [canSync, email]);

  // On connect: seed local-only items to the cloud, then subscribe live.
  useEffect(() => {
    if (!canSync || !email) return;
    pushToCloud().catch(() => {});
    return subscribeTodos(email, setTodos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSync, email]);

  const addTodo = useCallback(
    (text: string, dueAt: string | null) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const todo: Todo = {
        id: crypto.randomUUID(),
        text: trimmed,
        note: "",
        done: false,
        dueAt: dueAt ?? null,
        createdAt: new Date().toISOString(),
        day: todayKey(),
      };
      setTodos((prev) => [todo, ...prev]);
      if (canSync && email) saveTodo(email, todo).catch(() => {});
      onLog?.("todo_added", `Added to-do: ${trimmed}`);
    },
    [canSync, email, onLog]
  );

  const toggleTodo = useCallback(
    (id: string) => {
      setTodos((prev) => {
        const next = prev.map((t) =>
          t.id === id ? { ...t, done: !t.done } : t
        );
        const updated = next.find((t) => t.id === id);
        if (canSync && email && updated) saveTodo(email, updated).catch(() => {});
        if (updated?.done) onLog?.("todo_done", `Completed to-do: ${updated.text}`);
        return next;
      });
    },
    [canSync, email, onLog]
  );

  const editTodo = useCallback(
    (id: string, patch: { text?: string; note?: string; dueAt?: string | null }) => {
      setTodos((prev) => {
        const next = prev.map((t) =>
          t.id === id
            ? {
                ...t,
                ...patch,
                text:
                  patch.text !== undefined ? patch.text.trim() : t.text,
              }
            : t
        );
        const updated = next.find((t) => t.id === id);
        if (canSync && email && updated && updated.text.length > 0) {
          saveTodo(email, updated).catch(() => {});
        }
        return next;
      });
    },
    [canSync, email]
  );

  const removeTodo = useCallback(
    (id: string) => {
      setTodos((prev) => prev.filter((t) => t.id !== id));
      if (canSync && email) deleteTodo(email, id).catch(() => {});
    },
    [canSync, email]
  );

  const restoreTodo = useCallback(
    (todo: Todo) => {
      setTodos((prev) =>
        prev.some((t) => t.id === todo.id) ? prev : [todo, ...prev]
      );
      if (canSync && email) saveTodo(email, todo).catch(() => {});
    },
    [canSync, email]
  );

  const active = useMemo(() => todos.filter((t) => !t.done), [todos]);
  const done = useMemo(() => todos.filter((t) => t.done), [todos]);

  return {
    todos,
    active,
    done,
    addTodo,
    toggleTodo,
    editTodo,
    removeTodo,
    restoreTodo,
    pullFromCloud,
    pushToCloud,
  };
}
