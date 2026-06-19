"use client";

import { useCallback, useMemo, useState } from "react";

export type SessionTask = {
  id: string;
  text: string;
  done: boolean;
};

/**
 * In-memory task list for the current focus session (Phase 2 — no persistence).
 */
export function useSessionTasks() {
  const [tasks, setTasks] = useState<SessionTask[]>([]);

  const addTask = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTasks((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: trimmed, done: false },
    ]);
  }, []);

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task
      )
    );
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
  }, []);

  const doneCount = useMemo(
    () => tasks.filter((task) => task.done).length,
    [tasks]
  );

  return { tasks, doneCount, addTask, toggleTask, removeTask };
}
